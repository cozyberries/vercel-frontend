# Cozy Berries Frontend

A modern Next.js application with a beautiful UI built using Tailwind CSS and Radix UI components.

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18 or higher)
- npm (v10 or higher)

## Getting Started

1. Clone the repository:
```bash
git clone <your-repository-url>
cd cozyberries/vercel-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint to check code quality

## Tech Stack

- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Form Handling**: React Hook Form
- **Validation**: Zod
- **State Management**: React Hooks
- **Charts**: Recharts
- **Date Handling**: date-fns
- **Icons**: Lucide React

## Project Structure

```
├── app/              # Next.js app directory
├── components/       # Reusable UI components
├── hooks/           # Custom React hooks
├── lib/             # Utility functions and configurations
├── public/          # Static assets
└── styles/          # Global styles
```

## Deployment

### Manual Deployment

1. Build the project:
```bash
npm run build
```

2. Install Vercel CLI globally:
```bash
npm install -g vercel
```

3. Deploy to Vercel:
```bash
vercel
```

4. Deploy to production:
```bash
vercel --prod
```

### Automatic Deployment

The project is configured for automatic deployments on the main branch:

1. Push your changes to the main branch:
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

2. Vercel will automatically:
   - Detect the changes
   - Build the project
   - Deploy to production
   - Provide a preview URL for pull requests

### Deployment URLs

- Production: https://cozyberries-frontend-1dbxd44uc-cozyberries-projects.vercel.app
- Preview: https://cozyberries-frontend-8gzcqcr3i-cozyberries-projects.vercel.app

### Environment Variables

If you need to set up environment variables:

1. Go to the Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add your environment variables

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 