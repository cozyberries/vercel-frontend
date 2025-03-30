"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Heart, ShoppingBag, User, Search, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { getLogoUrl } from "@/lib/supabase"

const navigation = [
  { name: "HOME", href: "/" },
  { name: "NEWBORN", href: "/collections/newborn" },
  { name: "BOY", href: "/collections/boy" },
  { name: "GIRL", href: "/collections/girl" },
  { name: "OCCASION", href: "/collections/occasion" },
  { name: "COUTURE", href: "/collections/couture" },
  { name: "GIFTING", href: "/collections/gifting" },
  { name: "OFFERS", href: "/offers" },
]

export default function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const logoUrl = getLogoUrl();

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
                      src={logoUrl}
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
                src={logoUrl}
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
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Heart className="h-5 w-5" />
              <span className="sr-only">Wishlist</span>
            </Button>
            <Button variant="ghost" size="icon">
              <ShoppingBag className="h-5 w-5" />
              <span className="sr-only">Cart</span>
            </Button>
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

