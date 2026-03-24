export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">NorvaOS</h1>
          <p className="text-sm text-slate-500">A Complete Legal Operating System</p>
        </div>
        {children}
      </div>
    </div>
  )
}
