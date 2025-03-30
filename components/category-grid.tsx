import Image from "next/image"
import Link from "next/link"

const categories = [
  {
    name: "Newborn",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/newborn",
  },
  {
    name: "Girl",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/girl",
  },
  {
    name: "Boy",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/boy",
  },
  {
    name: "Occasion",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/occasion",
  },
]

export default function CategoryGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      {categories.map((category) => (
        <Link key={category.name} href={category.href} className="group relative overflow-hidden rounded-lg">
          <div className="aspect-square overflow-hidden">
            <Image
              src={category.image || "/placeholder.svg"}
              alt={category.name}
              width={400}
              height={400}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <h3 className="text-white text-xl font-medium">{category.name}</h3>
          </div>
        </Link>
      ))}
    </div>
  )
}

