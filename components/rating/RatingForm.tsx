"use client";

import { ArrowLeft, ImageIcon, Send, X } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { FaStar } from "react-icons/fa";
import { CiStar } from "react-icons/ci";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { useRating } from "../rating-context";
import { useAuth } from "../supabase-auth-provider";
import { toast } from "sonner";

interface RatingFormProps {
    onSubmitRating: (data: any) => void;
    onCancel: () => void;
}

export default function RatingForm({ onSubmitRating, onCancel }: RatingFormProps) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [hover, setHover] = useState<number | null>(null);
    const [previewImage, setPreviewImage] = useState<(File | string)[]>([]);
    const [loading, setLoading] = useState(false);
    const { productId, setProductId } = useRating();
    const { user } = useAuth();

    const handleAddProductImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        setPreviewImage((prev) => [...prev, ...files]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
          const uploadedUrls: string[] = [];
          for (const f of previewImage) {
              const url = await uploadImageToCloudinary(f as File);
              uploadedUrls.push(url)
          }
          const submitData = {
            user_id: user?.id,
            product_id: Number(productId),
            rating: rating, 
            comment: comment,
            images: uploadedUrls,
          };
          await onSubmitRating(submitData);
          setProductId(0);
          toast.success("Rating submitted successfully");
        } catch (error) {
          toast.error("Error submitting rating");
          console.error("Error submitting form:", error);
        } finally {
          setLoading(false);
        }
      };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
                <Button variant="ghost" onClick={onCancel}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        {"Rate the Product"}
                    </h1>
                </div>
            </div>

            {/* Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Rate the Product</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, ind: number) => {
                                    const curretntRating = ind + 1;
                                    return (
                                        <label key={ind}>
                                            <input
                                                className="hidden"
                                                type="radio"
                                                value={curretntRating}
                                                onClick={() => setRating(curretntRating)}
                                            />
                                            {curretntRating <= (hover || rating) ? (
                                                <FaStar
                                                    className="cursor-pointer w-6 h-6 md:w-7 md:h-7"
                                                    color="#6F5B35"
                                                    onMouseEnter={() => setHover(curretntRating)}
                                                    onMouseLeave={() => setHover(null)}
                                                />
                                            ) : (
                                                <CiStar
                                                    className="cursor-pointer w-6 h-6 md:w-7 md:h-7"
                                                    color="#6F5B35"
                                                    onMouseEnter={() => setHover(curretntRating)}
                                                    onMouseLeave={() => setHover(null)}
                                                />
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                            <div>
                                <Label>Product Images</Label>
                                <div className="flex flex-wrap gap-4 mt-2">
                                    {/* Show existing images */}
                                    {previewImage?.length > 0 ? (
                                        previewImage?.map((img: File | string, idx: number) => (
                                            <div key={idx} className="relative">
                                                <Image
                                                    src={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                                    alt={`Product ${idx}`}
                                                    width={80}
                                                    height={80}
                                                    className="rounded-md border"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full py-1 px-[7px] text-xs"
                                                    onClick={() => {
                                                        setPreviewImage((prev) => prev.filter((_, i) => i !== idx));
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="w-20 h-20 border rounded-md flex items-center justify-center text-gray-400">
                                            <ImageIcon className="w-6 h-6" />
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handleAddProductImage}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <Textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Enter your comment"
                                    rows={4}
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="rating">Rating *</Label>
                                <Input
                                    id="name"
                                    value={rating}
                                    onChange={(e) => setRating(parseInt(e.target.value))}
                                    placeholder="Enter product name"
                                    required
                                />
                            </div>                              
                        </div>

                        {/* Form Actions */}
                        <div className="flex justify-end space-x-4 pt-6 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                                disabled={loading}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                <Send className="h-4 w-4 mr-2" />
                                {loading ? "Saving..." : "Submit Rating"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
};