import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className={`relative w-14 h-7 rounded-full transition-smooth ${
        theme === 'dark'
          ? 'bg-primary/30'
          : 'bg-primary/20'
      } ${className}`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className={`absolute top-0.5 transition-all duration-300 ${
        theme === 'dark' ? 'left-7' : 'left-0.5'
      } w-6 h-6 rounded-full shadow-md flex items-center justify-center ${
        theme === 'dark' ? 'bg-surface-dark' : 'bg-white'
      }`}>
        {theme === 'dark' ? (
          <Moon className="w-3.5 h-3.5 text-primary-light" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-gold-dark" />
        )}
      </div>
    </button>
  )
}
