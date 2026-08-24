import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            A
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            AIKIM <span className="text-blue-600">Mortgage OS</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Reset your password.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
