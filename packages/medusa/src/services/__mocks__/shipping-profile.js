import { IdMap } from "medusa-test-utils"

export const profiles = {
  default: {
    _id: IdMap.getId("default"),
    name: "default_profile",
    products: [],
    shipping_options: [],
  },
}

export const ShippingProfileServiceMock = {
  list: jest.fn().mockImplementation(selector => {
    if (selector.shipping_options === IdMap.getId("fail")) {
      return Promise.resolve([])
    }
    if (selector.shipping_options === IdMap.getId("freeShipping")) {
      return Promise.resolve([{ _id: "default_profile" }])
    }
    if (selector.shipping_options === IdMap.getId("additional")) {
      return Promise.resolve([{ _id: "additional_profile" }])
    }
    if (
      selector.products &&
      selector.products.$in.includes(IdMap.getId("product"))
    ) {
      return Promise.resolve([
        {
          name: "default",
          products: [IdMap.getId("product")],
          shipping_options: [
            {
              _id: IdMap.getId("freeShipping"),
              name: "Free Shipping",
              region_id: IdMap.getId("testRegion"),
              price: {
                type: "flat_rate",
                amount: 10,
              },
              requirements: [{ type: "max_subtotal", value: 1000 }],
              data: {
                id: "fs",
              },
              provider_id: "test_shipper",
            },
          ],
        },
      ])
    }

    if (
      selector.products &&
      selector.products.$in.includes(IdMap.getId("product1"))
    ) {
      return Promise.resolve([
        {
          name: "default1",
          products: [IdMap.getId("product1")],
          shipping_options: [
            {
              _id: IdMap.getId("freeShipping"),
              name: "Free Shipping",
              region_id: IdMap.getId("testRegion"),
              price: {
                type: "flat_rate",
                amount: 10,
              },
              requirements: [{ type: "max_subtotal", value: 1000 }],
              data: {
                id: "fs",
              },
              provider_id: "test_shipper",
            },
          ],
        },
        {
          name: "default2",
          products: [IdMap.getId("product2")],
          shipping_options: [
            {
              _id: IdMap.getId("freeShipping"),
              name: "Free French Shipping",
              region_id: IdMap.getId("region-france"),
              price: {
                type: "flat_rate",
                amount: 10,
              },
              requirements: [{ type: "max_subtotal", value: 1000 }],
              data: {
                id: "fs",
              },
              provider_id: "test_shipper",
            },
          ],
        },
      ])
    }
  }),
}

const mock = jest.fn().mockImplementation(() => {
  return ShippingProfileServiceMock
})

export default mock