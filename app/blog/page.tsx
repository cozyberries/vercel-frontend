"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  Calendar,
  User,
  Clock,
  Heart,
  MessageCircle,
  Tag,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toImageSrc } from "@/lib/utils/image";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishDate: string;
  readTime: string;
  category: string;
  tags: string[];
  image: string;
  likes: number;
  comments: number;
  featured: boolean;
}

const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "The Ultimate Guide to Dressing Your Baby for Every Season",
    excerpt:
      "Learn how to choose the perfect outfits for your little one throughout the year, from summer heat to winter chills.",
    content:
      "Dressing your baby appropriately for each season is crucial for their comfort and safety...",
    author: "Sarah Johnson",
    publishDate: "2024-12-10",
    readTime: "5 min read",
    category: "Baby Care",
    tags: ["seasonal", "dressing", "comfort", "safety"],
    image: "/blog/baby-seasonal-dressing.jpg",
    likes: 42,
    comments: 8,
    featured: true,
  },
  {
    id: "2",
    title: "Organic Cotton vs. Regular Cotton: What's Best for Your Baby?",
    excerpt:
      "Discover the differences between organic and regular cotton and why it matters for your baby's sensitive skin.",
    content:
      "When it comes to baby clothing, the choice of fabric can make a significant difference...",
    author: "Dr. Emily Chen",
    publishDate: "2024-12-08",
    readTime: "7 min read",
    category: "Materials",
    tags: ["organic", "cotton", "safety", "materials"],
    image: "/blog/organic-cotton.jpg",
    likes: 38,
    comments: 12,
    featured: true,
  },
  {
    id: "3",
    title: "10 Essential Baby Clothes Every New Parent Needs",
    excerpt:
      "A comprehensive checklist of must-have baby clothing items for the first year of your little one's life.",
    content:
      "Preparing for a new baby can be overwhelming, especially when it comes to clothing...",
    author: "Lisa Martinez",
    publishDate: "2024-12-05",
    readTime: "6 min read",
    category: "Essentials",
    tags: ["essentials", "newborn", "checklist", "first-year"],
    image: "/blog/baby-essentials.jpg",
    likes: 55,
    comments: 15,
    featured: false,
  },
  {
    id: "4",
    title: "How to Properly Care for Your Baby's Clothes",
    excerpt:
      "Simple tips and tricks to keep your baby's clothes soft, clean, and long-lasting.",
    content:
      "Proper care of baby clothes not only keeps them looking great but also ensures they're safe...",
    author: "Jennifer Lee",
    publishDate: "2024-12-03",
    readTime: "4 min read",
    category: "Care Tips",
    tags: ["care", "washing", "maintenance", "longevity"],
    image: "/blog/baby-clothes-care.jpg",
    likes: 29,
    comments: 6,
    featured: false,
  },
  {
    id: "5",
    title: "The Science Behind Baby-Safe Fabrics",
    excerpt:
      "Understanding what makes fabrics safe for babies and how to identify the best materials.",
    content:
      "Not all fabrics are created equal when it comes to baby safety and comfort...",
    author: "Dr. Michael Rodriguez",
    publishDate: "2024-12-01",
    readTime: "8 min read",
    category: "Safety",
    tags: ["safety", "fabrics", "science", "health"],
    image: "/blog/baby-safe-fabrics.jpg",
    likes: 33,
    comments: 9,
    featured: false,
  },
  {
    id: "6",
    title: "Sustainable Fashion for Babies: Making Eco-Friendly Choices",
    excerpt:
      "How to build an environmentally conscious wardrobe for your little one without compromising on style.",
    content:
      "As parents, we want the best for our children, including a healthy planet...",
    author: "Emma Thompson",
    publishDate: "2024-11-28",
    readTime: "6 min read",
    category: "Sustainability",
    tags: ["sustainability", "eco-friendly", "environment", "fashion"],
    image: "/blog/sustainable-baby-fashion.jpg",
    likes: 47,
    comments: 11,
    featured: false,
  },
];

const categories = [
  "All",
  "Baby Care",
  "Materials",
  "Essentials",
  "Care Tips",
  "Safety",
  "Sustainability",
];

export default function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 6;

  const filteredPosts = blogPosts.filter((post) => {
    const matchesCategory =
      selectedCategory === "All" || post.category === selectedCategory;
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesCategory && matchesSearch;
  });

  const featuredPosts = filteredPosts.filter((post) => post.featured);
  const regularPosts = filteredPosts.filter((post) => !post.featured);

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const startIndex = (currentPage - 1) * postsPerPage;
  const paginatedPosts = filteredPosts.slice(
    startIndex,
    startIndex + postsPerPage
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">CozyBerries Blog</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tips, guides, and insights for parents who want the best for their
            little ones
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search blog posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  onClick={() => setSelectedCategory(category)}
                  size="sm"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Featured Posts */}
        {featuredPosts.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured Articles</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {featuredPosts.map((post) => (
                <Card
                  key={post.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="aspect-video bg-gray-100 relative">
                    <Image
                      src={toImageSrc(post.image)}
                      alt={post.title}
                      fill
                      className="object-cover"
                    />
                    <Badge className="absolute top-4 left-4">Featured</Badge>
                  </div>
                  <CardHeader>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Badge variant="secondary">{post.category}</Badge>
                      <span>•</span>
                      <span>{formatDate(post.publishDate)}</span>
                      <span>•</span>
                      <span>{post.readTime}</span>
                    </div>
                    <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                    <CardDescription className="line-clamp-3">
                      {post.excerpt}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        {post.author}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          {post.likes}
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-4 w-4" />
                          {post.comments}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-4">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button className="w-full mt-4" asChild>
                      <Link href={`/blog/${post.id}`}>Read More</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Regular Posts */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Latest Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedPosts.map((post) => (
              <Card
                key={post.id}
                className="overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="aspect-video bg-gray-100 relative">
                  <Image
                    src={toImageSrc(post.image)}
                    alt={post.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <CardHeader>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Badge variant="secondary">{post.category}</Badge>
                    <span>•</span>
                    <span>{formatDate(post.publishDate)}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>
                  <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                  <CardDescription className="line-clamp-3">
                    {post.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      {post.author}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Heart className="h-4 w-4" />
                        {post.likes}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        {post.comments}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-4">
                    {post.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                    {post.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{post.tags.length - 3} more
                      </Badge>
                    )}
                  </div>
                  <Button className="w-full mt-4" asChild>
                    <Link href={`/blog/${post.id}`}>Read More</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Newsletter Signup */}
        <Card className="mt-12">
          <CardHeader className="text-center">
            <CardTitle>Stay Updated</CardTitle>
            <CardDescription>
              Subscribe to our newsletter for the latest parenting tips, product
              updates, and exclusive offers
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <Input
                placeholder="Enter your email"
                type="email"
                className="flex-1"
              />
              <Button>Subscribe</Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              No spam, unsubscribe at any time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
