export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-pink-50 relative overflow-hidden">
      {/* Boho Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-32 h-32 bg-amber-200 rounded-full blur-xl"></div>
        <div className="absolute top-32 right-20 w-24 h-24 bg-pink-200 rounded-full blur-lg"></div>
        <div className="absolute bottom-20 left-1/4 w-28 h-28 bg-orange-200 rounded-full blur-xl"></div>
        <div className="absolute bottom-32 right-1/3 w-20 h-20 bg-yellow-200 rounded-full blur-lg"></div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-20 left-1/4 text-amber-300 opacity-20">
          <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div className="absolute top-40 right-1/4 text-pink-300 opacity-20">
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div className="absolute bottom-40 left-1/3 text-orange-300 opacity-20">
          <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <div className="max-w-lg mx-auto text-center">
          {/* Boho Logo/Brand */}
          <div className="mb-8">
            <div className="w-32 h-32 mx-auto bg-gradient-to-br from-amber-100 to-pink-100 rounded-full flex items-center justify-center shadow-lg border-4 border-white">
              <svg
                className="w-16 h-16 text-amber-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
          </div>

          {/* Brand Name */}
          <h1 className="text-5xl font-bold text-amber-800 mb-2 font-serif">
            Cozyberries
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-amber-700 mb-8 font-light">
            Baby Clothing Boutique
          </p>

          {/* Main Message */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-amber-100 mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4 font-serif">
              Coming Soon
            </h2>

            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              We're crafting something magical for your little ones. Our
              collection of organic, sustainable baby clothing is almost ready!
            </p>

            {/* Features Preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3">
                <div className="w-12 h-12 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-2">
                  <svg
                    className="w-6 h-6 text-amber-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">
                  Organic Materials
                </p>
              </div>
              <div className="text-center p-3">
                <div className="w-12 h-12 mx-auto bg-pink-100 rounded-full flex items-center justify-center mb-2">
                  <svg
                    className="w-6 h-6 text-pink-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">Sustainable</p>
              </div>
              <div className="text-center p-3">
                <div className="w-12 h-12 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-2">
                  <svg
                    className="w-6 h-6 text-orange-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">Comfortable</p>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="bg-gradient-to-r from-amber-100 to-pink-100 rounded-2xl p-6 shadow-lg border border-amber-200">
            <h3 className="text-xl font-bold text-gray-800 mb-3 font-serif">
              Stay in the Loop
            </h3>
            <p className="text-gray-600 mb-4">
              Be the first to know when we launch our collection!
            </p>
            <div className="flex items-center justify-center space-x-2 text-amber-700">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="font-medium">hello@cozyberries.com</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-sm text-amber-600">
            <p>© 2024 Cozyberries. Crafted with love for your little ones.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
