import { Separator } from "@radix-ui/react-select";

export default function LoadingCard() {

    return (
        <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                {/* Product Images */}
                <div className="space-y-4 lg:space-y-0 lg:flex lg:gap-4">
                    <div className="hidden lg:flex flex-col gap-2 w-20">
                        {[1, 2, 3, 4].map((_, index) => (
                            <div
                                key={index}
                                className="aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer"
                            >
                                <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg"></div>
                            </div>
                        ))}
                    </div>
                    {/* Main Image */}
                    <div className="lg:flex-1">
                        <div className="aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer">
                            <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-6 gap-2 lg:hidden">
                        {[1, 2, 3, 4].map((_, index) => (
                            <div
                                key={index}
                                className="aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer"
                            >
                                <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Product Details */}
                <div className="flex flex-col">
                    <div>
                        <div className="flex items-center justify-between mt-2 mb-4">
                            <h1 className="bg-gray-200 animate-pulse rounded-lg w-full h-10"></h1>
                        </div>
                        <p className="mb-6 bg-gray-200 animate-pulse rounded-lg w-[200px] h-10"></p>
                        <div className="space-y-6 mb-8">
                            <div className="bg-gray-200 animate-pulse rounded-lg w-[200px] h-10"></div>
                        </div>
                        <div className="hidden md:flex flex-col sm:flex-row gap-4 mb-8">
                            <div className="bg-gray-200 animate-pulse rounded-lg w-1/2 h-10"></div>
                            <div className="bg-gray-200 animate-pulse rounded-lg w-1/2 h-10"></div>
                        </div>
                        <Separator className="my-8" />
                        <div className="space-y-6">
                            <div className="bg-gray-200 animate-pulse rounded-lg w-1/2 h-10"></div>
                            <div className="bg-gray-200 animate-pulse rounded-lg w-full h-10"></div>
                            <div className="bg-gray-200 animate-pulse rounded-lg w-full h-10"></div>
                        </div>
                        <Separator className="my-8" />
                    </div>
                </div>
            </div>
        </div>
    )
}