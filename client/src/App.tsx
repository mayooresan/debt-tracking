import { Landmark } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Debt Management</h1>
              <p className="text-xs text-gray-500">Track and pay down debts with ease</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Frontend Scaffolding Active
          </h2>
          <p className="text-gray-600 max-w-md mx-auto">
            React Vite client with Tailwind CSS and typed API client layer initialized.
            Ready for dashboard UI components.
          </p>
        </div>
      </main>
    </div>
  );
}
