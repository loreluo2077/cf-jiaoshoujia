import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	plugins: [react(), tailwindcss(), cloudflare()],
	build: {
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						{
							name: 'react-vendor',
							test: /node_modules[\\/](react|react-dom)[\\/]/,
							priority: 30,
						},
							{
								name: 'ui-vendor',
								test: /node_modules[\\/](class-variance-authority|clsx|tailwind-merge)[\\/]/,
								priority: 20,
							},

						{
							name: 'icons-vendor',
							test: /node_modules[\\/]lucide-react[\\/]/,
							priority: 10,
						},
					],
				},
			},
		},
	},
});
