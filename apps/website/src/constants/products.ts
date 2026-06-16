import {env} from '~env-secrets'

export const products = [
  {
    title: 'Gift One',
    quantity: 1,
    price: 25,
    icon: 'user',
    description:
      "Ideal if you'd like to surprise yourself or someone else with 1 deck of WhoCards.",
    priceId: env.STRIPE_PRODUCTS[1].price,
    shippingId: env.STRIPE_PRODUCTS[1].shipping,
  },
  {
    title: 'Friends',
    quantity: 2,
    price: 45,
    icon: 'group-2-outline',
    description:
      'Ideal if you would like receive 2 decks of WhoCards and surprise someone else with one of the packs.',
    priceId: env.STRIPE_PRODUCTS[2].price,
    shippingId: env.STRIPE_PRODUCTS[2].shipping,
  },
  {
    title: 'Community',
    quantity: 5,
    price: 100,
    icon: 'group-3-outline',
    description: 'Ideal if you want to go above and beyond and gift away 5 decks of WhoCards.',
    priceId: env.STRIPE_PRODUCTS[5].price,
    shippingId: env.STRIPE_PRODUCTS[5].shipping,
  },
  {
    title: 'SuperSpreader',
    quantity: 12,
    price: 220,
    icon: 'spreader',
    description:
      "Ideal if you're ready to act big to ripple waves of meaningful connection into the world and gift away 12 decks of WhoCards.",
    priceId: env.STRIPE_PRODUCTS[12].price,
    shippingId: env.STRIPE_PRODUCTS[12].shipping,
  },
]
