"use client";

import Image from "next/image";
import Link from "next/link";

const categories = [
  {
    name: "Newborn",
    image:
      "https://media.istockphoto.com/id/892959344/photo/cute-adorable-baby-child-with-warm-white-and-pink-hat-with-cute-bobbles.jpg?s=612x612&w=0&k=20&c=lIOfXpMfIcsnyJ9FbX9IZWBloxyw69T4Qn6jPKJPON8=",
    href: "/products?category=newborn",
  },
  {
    name: "Girl",
    image:
      "https://teamjapanese.com/wp-content/uploads/2021/12/please-in-japanese.jpg",
    href: "/products?category=girl",
  },
  {
    name: "Boy",
    image:
      "https://teamjapanese.com/wp-content/uploads/2022/03/boy-in-japanese.jpg",
    href: "/products?category=boy",
  },
  {
    name: "Tradional",
    image:
      "https://mamaandpeaches.com/cdn/shop/files/SunflowerKurtaSet_3.jpg?v=1743155848&width=1100",
    href: "/products?category=tradional",
  },
  {
    name: "Inner Wear",
    image: "https://m.media-amazon.com/images/I/51uO5vDU92L._UY1100_.jpg",
    href: "/products?category=inner-wear",
  },
];

export default function CategoryGrid() {
  return (
    <div className="grid lg:grid-cols-5 grid-cols-3 gap-8">
      {categories.map((category) => (
        <Link
          key={category.name}
          href={category.href}
          className="group relative overflow-hidden lg:rounded-lg rounded-full"
        >
          <div className="aspect-square overflow-hidden">
            <Image
              src={category.image}
              alt={category.name}
              width={200}
              height={200}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <h3 className="text-white text-xl font-medium">{category.name}</h3>
          </div>
        </Link>
      ))}
    </div>
  );
}
