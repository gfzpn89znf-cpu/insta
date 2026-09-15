/**
 * Baut aus dem Vite-Build eine einzelne, eigenstaendige HTML-Datei fuer das
 * Artifact. Alles wird eingebettet, damit die Seite ohne nachzuladende
 * Dateien startet.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user-insta/f8f5aa06-6a22-553d-97bf-8844ef924aa4/scratchpad';
const dir = 'dist-artifact/assets';
const jsFiles = readdirSync(dir).filter((f) => f.endsWith('.js'));
const cssFiles = readdirSync(dir).filter((f) => f.endsWith('.css'));

// Der Einzeldatei-Build darf genau eine JS- und eine CSS-Datei erzeugen.
// Mehrere hiessen: etwas wurde abgespalten und wuerde in der Vorschau fehlen.
if (jsFiles.length !== 1 || cssFiles.length !== 1) {
  throw new Error(
    `Erwartet je eine JS- und CSS-Datei, gefunden: ${jsFiles.length} JS, ${cssFiles.length} CSS. ` +
      'Bitte "npm run build:single" verwenden.',
  );
}
const jsFile = jsFiles[0];
const cssFile = cssFiles[0];

const shell = readFileSync(`${SCRATCH}/shell.html`, 'utf8');
const css = readFileSync(`${dir}/${cssFile}`, 'utf8');
const js = readFileSync(`${dir}/${jsFile}`, 'utf8');

// Ein </script irgendwo im Code wuerde das Skript-Element vorzeitig beenden.
const safeJs = js.replace(/<\/script/gi, '<\\/script');
// Ersetzung als Funktion: sonst deutet JavaScript $-Folgen im Code als Muster.
const out = shell
  .replace('<!--APP_CSS-->', () => `<style>\n${css}\n</style>`)
  .replace('<!--APP_JS-->', () => `<script type="module">\n${safeJs}\n</script>`);

// Genau ein echtes Skript-Element. Zeichenketten wie "<script>" im Code
// sind harmlos, solange sie kein unmaskiertes </script> enthalten.
const opens = (out.match(/<script type="module">/g) ?? []).length;
const closes = (out.match(/<\/script>/g) ?? []).length;
if (opens !== 1 || closes !== 1) {
  throw new Error(`Unerwartete Skript-Tags: ${opens} geoeffnet, ${closes} geschlossen`);
}
if (out.includes('src="app.js"') || out.includes('href="app.css"')) {
  throw new Error('Es werden noch Dateien nachgeladen');
}

writeFileSync(`${SCRATCH}/fotogram.html`, out);
console.log(`Einzeldatei: ${(out.length / 1024).toFixed(0)} KB, ${opens} Skriptblock, Pruefungen bestanden`);
