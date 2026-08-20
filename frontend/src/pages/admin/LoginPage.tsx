import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'

// ==========================================
// Login Page
// ==========================================

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
})

type LoginForm = z.infer<typeof loginSchema>

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await authApi.login(data)
      login(response.user, response.token)
      toast.success('Selamat datang, ' + response.user.name + '!')
      navigate('/gallery', { replace: true })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      const message = error.response?.data?.message || 'Email atau password salah.'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      {/* Background subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              <span className="text-black font-bold text-xl">PB</span>
            </div>
          </motion.div>
          <h1 className="text-white font-bold text-2xl tracking-tight">PixelBooth</h1>
          <p className="text-[#606060] text-sm mt-1">Sistem Photobooth Profesional</p>
        </div>

        {/* Form */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 shadow-2xl">
          <h2 className="text-white font-semibold text-base mb-6">Masuk ke Dashboard</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606060]" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="admin@pixelbooth.com"
                  autoComplete="email"
                  className={`
                    w-full bg-[#0A0A0A] border rounded-lg pl-9 pr-4 py-3
                    text-white text-sm placeholder:text-[#404040]
                    focus:outline-none focus:ring-1 transition-colors
                    ${errors.email
                      ? 'border-red-500/50 focus:ring-red-500/30'
                      : 'border-[#2A2A2A] focus:border-[#404040] focus:ring-white/10'
                    }
                  `}
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#606060]" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`
                    w-full bg-[#0A0A0A] border rounded-lg pl-9 pr-10 py-3
                    text-white text-sm placeholder:text-[#404040]
                    focus:outline-none focus:ring-1 transition-colors
                    ${errors.password
                      ? 'border-red-500/50 focus:ring-red-500/30'
                      : 'border-[#2A2A2A] focus:border-[#404040] focus:ring-white/10'
                    }
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#606060] hover:text-[#A0A0A0]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              className="mt-2"
            >
              {isSubmitting ? 'Masuk...' : 'Masuk'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[#404040] text-xs mt-6">
          PixelBooth v1.0 — Hanya untuk Admin
        </p>
      </motion.div>
    </div>
  )
}

export default LoginPage
