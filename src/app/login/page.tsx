import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
            A
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            AIKIM <span className="text-emerald-600">Mortgage OS</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage your mortgage operations.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
