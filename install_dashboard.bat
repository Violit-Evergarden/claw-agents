@echo off
cd /d D:\MyFiles\project\claw-agents\dashboard
npm install
npm install tailwindcss@3.4.17 tailwind-merge@^2.5.5 tailwindcss-animate@^1.0.7 postcss@8.5 autoprefixer@^10.4.20 lucide-react react-icons recharts
npx tailwindcss init -p
echo DEPS_DONE
