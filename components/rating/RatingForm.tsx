"use client";

import { ArrowLeft, ImageIcon, Send, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { FaStar } from "react-icons/fa";
import { CiStar } from "react-icons/ci";
import { useRating } from "../rating-context";
import { useAuth } from "../supabase-auth-provider";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface RatingFormProps {
    onSubmitRating: (data: any) => void;
    onCancel: () => void;
    redirectTo?: string; // Optional redirect path after submission
}

// Helper function to validate redirect paths
function isValidInternalPath(path: string | undefined): boolean {
    if (!path) return false;
    // Must start with exactly one "/" and not start with "//"
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    // Must not contain schemes
    if (path.includes("http:") || path.includes("https:")) return false;
    // Must not contain CR/LF
    if (path.includes("\r") || path.includes("\n")) return false;
    return true;
}

export default function RatingForm({ onSubmitRating, onCancel, redirectTo }: RatingFormProps) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [hover, setHover] = useState<number | null>(null);
    const [previewImage, setPreviewImage] = useState<(File | string)[]>([]);
    const blobUrlToFileRef = useRef<Map<string, File>>(new Map());
    const previewImageRef = useRef(previewImage);
    previewImageRef.current = previewImage;
    const [loading, setLoading] = useState(false);
    const { productId } = useRating();
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        return () => {
            previewImageRef.current.forEach((item) => {
                if (typeof item === "string" && item.startsWith("blob:")) {
                    URL.revokeObjectURL(item);
                }
            });
        };
    }, []);

    const handleAddProductImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        const urls = files.map((f) => URL.createObjectURL(f));
        urls.forEach((url, i) => blobUrlToFileRef.current.set(url, files[i]));
        setPreviewImage((prev) => [...prev, ...urls]);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        if (rating === 0) {
            toast.error("Please select a rating");
            setLoading(false);
            return;
        }
        if (comment.length < 10) {
            toast.error("Please enter a comment with at least 10 characters");
            setLoading(false);
            return;
        }
        try {
            const imageFiles = previewImage.map((item) =>
                item instanceof File ? item : blobUrlToFileRef.current.get(item)
            ).filter((f): f is File => f != null);
            const submitData = {
                user_id: user?.id,
                product_id: productId,
                rating: rating,
                comment: comment,
                imageFiles,
            };
            await onSubmitRating(submitData);
            setRating(0);
            setComment("");
            previewImage.forEach((item) => {
                if (typeof item === "string" && item.startsWith("blob:")) {
                    URL.revokeObjectURL(item);
                }
            });
            blobUrlToFileRef.current.clear();
            setPreviewImage([]);
            
            // Call onCancel before navigation to avoid unmounting race
            onCancel();
            
            // Only redirect when a valid redirect path is explicitly provided (e.g. from orders page)
            if (redirectTo && isValidInternalPath(redirectTo)) {
                try {
                    await router.push(redirectTo);
                } catch (error) {
                    console.error("Navigation error:", error);
                }
            }
        } catch (error) {
            console.error("Error submitting form:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 mt-10 mb-20">
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
                                                    color="#6F5B44"
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
                                                        const removed = previewImage[idx];
                                                        if (typeof removed === "string" && removed.startsWith("blob:")) {
                                                            URL.revokeObjectURL(removed);
                                                            blobUrlToFileRef.current.delete(removed);
                                                        }
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