import Image from "next/image"
import Link from "next/link"
import { Heart, Filter, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

// Mock data for products
const products = [
  {
    id: 1,
    name: "Organic Cotton Onesie",
    price: 24.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Newborn",
  },
  {
    id: 2,
    name: "Soft Knit Baby Blanket",
    price: 39.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Accessories",
  },
  {
    id: 3,
    name: "Ruffled Sleeve Dress",
    price: 32.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Girl",
  },
  {
    id: 4,
    name: "Striped Romper Set",
    price: 29.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Boy",
  },
  {
    id: 5,
    name: "Knitted Cardigan",
    price: 34.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Newborn",
  },
  {
    id: 6,
    name: "Embroidered Bib Set",
    price: 19.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Accessories",
  },
  {
    id: 7,
    name: "Floral Print Dress",
    price: 36.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Girl",
  },
  {
    id: 8,
    name: "Linen Shorts",
    price: 26.99,
    image: "/placeholder.svg?height=400&width=400",
    category: "Boy",
  },
]

// Categories for the page
const categories = {
  newborn: {
    title: "Newborn Collection",
    description: "Soft, gentle clothing for your newborn baby",
  },
  girl: {
    title: "Girls Collection",
    description: "Beautiful styles for your little princess",
  },
  boy: {
    title: "Boys Collection",
    description: "Stylish and comfortable clothing for your little gentleman",
  },
  occasion: {
    title: "Occasion Wear",
    description: "Special outfits for memorable moments",
  },
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  const category = params.category
  const categoryInfo = categories[category as keyof typeof categories] || {
    title: "Collection",
    description: "Explore our collection of baby clothing",
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Category Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-light mb-4">{categoryInfo.title}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">{categoryInfo.description}</p>
      </div>

      {/* Filters and Sorting */}
      <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Filter Products</SheetTitle>
              <SheetDescription>Narrow down your product search with the following filters.</SheetDescription>
            </SheetHeader>
            <div className="py-6 space-y-6">
              <div>
                <h3 className="font-medium mb-4">Size</h3>
                <div className="space-y-3">
                  {["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"].map((size) => (
                    <div key={size} className="flex items-center space-x-2">
                      <Checkbox id={`size-${size}`} />
                      <Label htmlFor={`size-${size}`}>{size}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-4">Color</h3>
                <div className="space-y-3">
                  {["White", "Pink", "Blue", "Yellow", "Green"].map((color) => (
                    <div key={color} className="flex items-center space-x-2">
                      <Checkbox id={`color-${color}`} />
                      <Label htmlFor={`color-${color}`}>{color}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-4">Price</h3>
                <div className="space-y-3">
                  {["Under $20", "$20 - $30", "$30 - $40", "Over $40"].map((price) => (
                    <div key={price} className="flex items-center space-x-2">
                      <Checkbox id={`price-${price}`} />
                      <Label htmlFor={`price-${price}`}>{price}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1">Apply Filters</Button>
              <Button variant="outline">Reset</Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select defaultValue="featured">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {products.map((product) => (
          <div key={product.id} className="group">
            <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
              <Link href={`/products/${product.id}`}>
                <Image
                  src={product.image || "/placeholder.svg"}
                  alt={product.name}
                  width={400}
                  height={400}
                  className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 bg-white/80 hover:bg-white rounded-full h-8 w-8"
              >
                <Heart className="h-4 w-4" />
                <span className="sr-only">Add to wishlist</span>
              </Button>
              <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" className="w-full rounded-none py-3">
                  Add to Cart
                </Button>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-sm font-medium mb-1">
                <Link href={`/products/${product.id}`} className="hover:text-primary">
                  {product.name}
                </Link>
              </h3>
              <p className="text-sm text-muted-foreground mb-1">{product.category}</p>
              <p className="font-medium">${product.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center mt-12">
        <nav className="flex items-center gap-1">
          <Button variant="outline" size="icon" disabled>
            <ChevronDown className="h-4 w-4 rotate-90" />
          </Button>
          <Button variant="outline" size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            1
          </Button>
          <Button variant="outline" size="sm">
            2
          </Button>
          <Button variant="outline" size="sm">
            3
          </Button>
          <Button variant="outline" size="icon">
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </Button>
        </nav>
      </div>
    </div>
  )
}

