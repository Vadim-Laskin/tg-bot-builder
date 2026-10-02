// После `vite build` (он кладёт конструктор в dist/cp) докладываем в корень
// dist/ статичный сайт из папки site/ — он открывается на главной странице.
import { cpSync, existsSync } from 'node:fs';

if (!existsSync('site')) {
  console.warn('[copy-site] папки site/ нет — главная страница будет пустой');
} else {
  cpSync('site', 'dist', { recursive: true });
  console.log('[copy-site] site/ → dist/');
}
