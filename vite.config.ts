import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function repositoryBase(): string {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  return repository ? `/${repository}/` : '/'
}

export default defineConfig({
  base: repositoryBase(),
  plugins: [react(), tailwindcss()],
})
