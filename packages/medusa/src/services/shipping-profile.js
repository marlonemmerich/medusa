import mongoose from "mongoose"
import _ from "lodash"
import { Validator, MedusaError } from "medusa-core-utils"
import { BaseService } from "medusa-interfaces"

/**
 * Provides layer to manipulate profiles.
 * @implements BaseService
 */
class ShippingProfileService extends BaseService {
  /** @param { shippingProfileModel: (ShippingProfileModel) } */
  constructor({ shippingProfileModel, productService, shippingOptionService }) {
    super()

    /** @private @const {ShippingProfileModel} */
    this.profileModel_ = shippingProfileModel

    /** @private @const {ProductService} */
    this.productService_ = productService

    /** @private @const {ShippingOptionService} */
    this.shippingOptionService_ = shippingOptionService
  }

  /**
   * Used to validate product ids. Throws an error if the cast fails
   * @param {string} rawId - the raw product id to validate.
   * @return {string} the validated id
   */
  validateId_(rawId) {
    const schema = Validator.objectId()
    const { value, error } = schema.validate(rawId)
    if (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "The profileId could not be casted to an ObjectId"
      )
    }

    return value
  }

  /**
   * @param {Object} selector - the query object for find
   * @return {Promise} the result of the find operation
   */
  list(selector) {
    return this.profileModel_.find(selector)
  }

  /**
   * Gets a profile by id.
   * Throws in case of DB Error and if profile was not found.
   * @param {string} profileId - the id of the profile to get.
   * @return {Promise<Product>} the profile document.
   */
  async retrieve(profileId) {
    const validatedId = this.validateId_(profileId)
    const profile = await this.profileModel_
      .findOne({ _id: validatedId })
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })

    if (!profile) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Shipping Profile with ${profileId} was not found`
      )
    }

    return profile
  }

  /**
   * Updates a profile. Metadata updates and product updates should use
   * dedicated methods, e.g. `setMetadata`, `addProduct`, etc. The function
   * will throw errors if metadata or product updates are attempted.
   * @param {string} profileId - the id of the profile. Must be a string that
   *   can be casted to an ObjectId
   * @param {object} update - an object with the update values.
   * @return {Promise} resolves to the update result.
   */
  update(profileId, update) {
    const validatedId = this.validateId_(profileId)

    if (update.metadata) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Use setMetadata to update metadata fields"
      )
    }

    if (update.products) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Use addProduct, removeProduct to update the products field"
      )
    }

    if (update.shipping_options) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Use addShippingOption, removeShippingOption to update the shipping_options field"
      )
    }

    return this.profileModel_
      .updateOne(
        { _id: validatedId },
        { $set: update },
        { runValidators: true }
      )
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })
  }

  /**
   * Deletes a profile with a given profile id.
   * @param {string} profileId - the id of the profile to delete. Must be
   *   castable as an ObjectId
   * @return {Promise} the result of the delete operation.
   */
  async delete(profileId) {
    let profile
    try {
      profile = await this.retrieve(profileId)
    } catch (error) {
      // Delete is idempotent, but we return a promise to allow then-chaining
      return Promise.resolve()
    }

    return this.profileModel_.deleteOne({ _id: profile._id }).catch(err => {
      throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
    })
  }

  /**
   * Adds a product to a profile. The method is idempotent, so multiple calls
   * with the same product variant will have the same result.
   * @param {string} profileId - the profile to add the product to.
   * @param {string} productId - the product to add.
   * @return {Promise} the result of update
   */
  async addProduct(profileId, productId) {
    const profile = await this.retrieve(profileId)
    const product = await this.productService_.retrieve(productId)

    if (profile.products.find(p => p === product._id)) {
      // If the product already exists in the profile we just return an
      // empty promise for then-chaining
      return Promise.resolve()
    }

    return this.profileModel_.updateOne(
      { _id: profile._id },
      { $push: { products: product._id } }
    )
  }

  /**
   * Adds a shipping option to the profile. The shipping option can be used to
   * fulfill the products in the products field.
   * @param {string} profileId - the profile to apply the shipping option to
   * @param {string} optionId - the option to add to the profile
   * @return {Promise} the result of the model update operation
   */
  async addShippingOption(profileId, optionId) {
    const profile = await this.retrieve(profileId)
    const shippingOption = await this.shippingOptionService_.retrieve(optionId)

    // Make sure that option doesn't already exist
    if (profile.shipping_options.find(o => o === shippingOption._id)) {
      // If the option already exists in the profile we just return an
      // empty promise for then-chaining
      return Promise.resolve()
    }

    // If the shipping method exists in a different profile remove it
    const profiles = await this.list({ shipping_options: shippingOption._id })
    if (profiles.length > 0) {
      await this.removeShippingOption(profiles[0]._id, shippingOption._id)
    }

    // Everything went well add the shipping option
    return this.profileModel_.updateOne(
      { _id: profileId },
      { $push: { shipping_options: shippingOption._id } }
    )
  }

  /**
   * Delete a shipping option from a profile.
   * @param {string} profileId - the profile to delete an option from
   * @param {string} optionId - the option to delete
   * @return {Promise} return the result of update
   */
  async removeShippingOption(profileId, optionId) {
    const profile = await this.retrieve(profileId)

    return this.profileModel_.updateOne(
      { _id: profileId },
      { $pull: { shipping_options: optionId } }
    )
  }

  /**
   * Removes a product from the a profile.
   * @param {string} profileId - the profile to remove the product from
   * @param {string} productId - the product to remove
   * @return {Promise} the result of update
   */
  async removeProduct(profileId, productId) {
    const profile = await this.retrieve(profileId)

    if (!profile.products.find(p => p === productId)) {
      // Remove is idempotent
      return Promise.resolve()
    }

    return this.profileModel_.updateOne(
      { _id: profile._id },
      { $pull: { products: productId } }
    )
  }

  /**
   * Decorates a profile.
   * @param {Profile} profile - the profile to decorate.
   * @param {string[]} fields - the fields to include.
   * @param {string[]} expandFields - fields to expand.
   * @return {Profile} return the decorated profile.
   */
  async decorate(profile, fields, expandFields = []) {
    const requiredFields = ["_id", "metadata"]
    let decorated = _.pick(profile, fields.concat(requiredFields))

    if (expandFields.includes("products")) {
      decorated.products = await Promise.all(
        profile.products.map(pId => this.productService_.retrieve(pId))
      )
    }

    if (expandFields.includes("shipping_options")) {
      decorated.shipping_options = await Promise.all(
        profile.shipping_options.map(oId =>
          this.shippingOptionService_.retrieve(oId)
        )
      )
    }

    return decorated
  }

  /**
   * Returns a list of all the productIds in the cart.
   * @param {Cart} cart - the cart to extract products from
   * @return {[string]} a list of product ids
   */
  getProductsInCart_(cart) {
    return cart.items.reduce((acc, next) => {
      if (Array.isArray(next.content)) {
        next.content.forEach(({ product }) => {
          if (!acc.includes(product._id)) {
            acc.push(product._id)
          }
        })
      } else {
        if (!acc.includes(next.content.product._id)) {
          acc.push(next.content.product._id)
        }
      }

      return acc
    }, [])
  }

  /**
   * Finds all the shipping profiles that cover the products in a cart, and
   * validates all options that are available for the cart.
   * @param {Cart} cart - the cart object to find shipping options for
   * @return {[ShippingOptions]} a list of the available shipping options
   */
  async fetchCartOptions(cart) {
    const products = this.getProductsInCart_(cart)
    const profiles = await this.list({ products: { $in: products } })
    const optionIds = profiles.reduce((acc, next) =>
      acc.concat(next.shipping_options)
    )

    const options = await Promise.all(
      optionIds.map(oId => {
        return this.shippingOptionService_
          .validateCartOption(oId, cart)
          .catch(err => {
            // If validation failed we skip the option
            return null
          })
      })
    )

    return options.filter(o => !!o)
  }

  /**
   * Dedicated method to set metadata for a profile.
   * @param {string} profileId - the profile to decorate.
   * @param {string} key - key for metadata field
   * @param {string} value - value for metadata field.
   * @return {Promise} resolves to the updated result.
   */
  setMetadata(profileId, key, value) {
    const validatedId = this.validateId_(profileId)

    if (typeof key !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "Key type is invalid. Metadata keys must be strings"
      )
    }

    const keyPath = `metadata.${key}`
    return this.profileModel_
      .updateOne({ _id: validatedId }, { $set: { [keyPath]: value } })
      .catch(err => {
        throw new MedusaError(MedusaError.Types.DB_ERROR, err.message)
      })
  }
}

export default ShippingProfileService