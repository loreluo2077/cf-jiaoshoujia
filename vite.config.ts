import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
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
							name: 'heroui-vendor',
							test: /node_modules[\\/](@heroui|@react-aria|react-aria|react-aria-components|input-otp|tailwind-variants)[\\/]/,
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
