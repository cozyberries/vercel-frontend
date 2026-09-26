import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/checkout/",
        "/profile/",
        "/complete-profile/",
        "/payment/",
        "/login/",
        "/signup/",
        "/cart/",
        "/wishlist/",
        "/offline/",
        "/orders/",
        "/track-order/",
        "/display",
        "/bill/",
      ],
    },
    sitemap: "https://cozyberries.in/sitemap.xml",
  };
}
