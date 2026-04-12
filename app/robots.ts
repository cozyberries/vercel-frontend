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
        "/register/",
        "/cart/",
        "/wishlist/",
        "/offline/",
        "/orders/",
        "/track-order/",
      ],
    },
    sitemap: "https://cozyberries.in/sitemap.xml",
  };
}
