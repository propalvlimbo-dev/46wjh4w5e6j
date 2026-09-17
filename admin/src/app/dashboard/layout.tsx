import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex justify-center">
        <div className="w-full max-w-5xl p-10">{children}</div>
      </main>
    </div>
  )
}