"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Heart, ShoppingBag, User, Search, Menu, X, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { getLogoUrl } from "@/lib/supabase"
import { useCart } from "@/components/cart-context"
import { useWishlist } from "@/components/wishlist-context"

const navigation = [
  { name: "HOME", href: "/" },
  { name: "PRODUCTS", href: "/products" },
]

export default function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string>('');
  const { cart, updateQuantity, removeFromCart, clearCart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  useEffect(() => {
    const loadLogoUrl = async () => {
      try {
        const url = await getLogoUrl();
        setLogoUrl(url);
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    };
    loadLogoUrl();
  }, []);

  return (
    <header className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <div className="flex flex-col h-full">
                <div className="border-b py-4">
                  <Link href="/" className="flex items-center justify-center">
                    <Image
                      src={logoUrl || "/placeholder.svg"}
                      alt="CozyBerries"
                      width={180}
                      height={50}
                      className="h-12 w-auto"
                    />
                  </Link>
                </div>
                <nav className="flex-1 py-8">
                  <ul className="space-y-6">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <Link href={item.href} className="block px-4 py-2 text-base font-medium hover:text-primary">
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="border-t py-4">
                  <div className="flex justify-center space-x-6">
                    <Button variant="ghost" size="icon">
                      <User className="h-5 w-5" />
                      <span className="sr-only">Account</span>
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Heart className="h-5 w-5" />
                      <span className="sr-only">Wishlist</span>
                    </Button>
                    <Button variant="ghost" size="icon">
                      <ShoppingBag className="h-5 w-5" />
                      <span className="sr-only">Cart</span>
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <div className="flex-1 flex items-center justify-center lg:justify-start">
            <Link href="/" className="flex items-center">
              <Image
                src={logoUrl || "/placeholder.svg"}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center justify-center flex-1">
            <ul className="flex space-x-8">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link href={item.href} className="text-sm font-medium hover:text-primary transition-colors">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Icons */}
          <div className="flex items-center justify-end flex-1 space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setIsSearchOpen(!isSearchOpen)}>
              {isSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
              <span className="sr-only">Search</span>
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <User className="h-5 w-5" />
              <span className="sr-only">Account</span>
            </Button>
            <Sheet open={isWishlistOpen} onOpenChange={setIsWishlistOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-10 w-10 relative">
                  <Heart className={`h-5 w-5 ${wishlist.length > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                  {wishlist.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-pink-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                      {wishlist.length}
                    </span>
                  )}
                  <span className="sr-only">Wishlist</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[350px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>Your Wishlist</SheetTitle>
                </SheetHeader>
                {wishlist.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">Your wishlist is empty.</div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 py-4">
                      {wishlist.map((item) => (
                        <div key={item.id} className="flex items-center gap-4 border-b pb-4">
                          <img src={item.image || "/placeholder.svg"} alt={item.name} className="w-16 h-16 object-cover rounded" />
                          <div className="flex-1">
                            <div className="font-medium">
                              <Link href={`/products/${item.id}`}>{item.name}</Link>
                            </div>
                            <div className="text-sm font-medium mt-1">₹{item.price.toFixed(2)}</div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeFromWishlist(item.id)}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="destructive" className="mt-4 w-full" onClick={clearWishlist}>
                      Clear All
                    </Button>
                  </>
                )}
              </SheetContent>
            </Sheet>
            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <ShoppingBag className="h-5 w-5" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                  <span className="sr-only">Cart</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[350px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>Your Cart</SheetTitle>
                </SheetHeader>
                {cart.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">Your cart is empty.</div>
                ) : (
                  <div className="flex flex-col gap-4 py-4">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 border-b pb-4">
                        <img src={item.image || "/placeholder.svg"} alt={item.name} className="w-16 h-16 object-cover rounded" />
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-muted-foreground">Qty: 
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => updateQuantity(item.id, Number(e.target.value))}
                              className="w-12 ml-2 border rounded px-1 text-center"
                            />
                          </div>
                          <div className="text-sm font-medium mt-1">₹{item.price.toFixed(2)}</div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.id)}>
                          ×
                        </Button>
                      </div>
                    ))}
                    <div className="flex justify-between items-center mt-4">
                      <span className="font-medium">Total:</span>
                      <span className="font-bold">₹{cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}</span>
                    </div>
                    <Button variant="destructive" className="mt-4" onClick={clearCart}>Clear Cart</Button>
                    <Button className="mt-2 w-full">Checkout</Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Search bar */}
        {isSearchOpen && (
          <div className="py-4 border-t">
            <div className="max-w-md mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search for products..." className="pl-10" autoFocus />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

