# 🚀 QA Check CLI

A powerful framework-aware QA CLI that automatically audits projects for code quality, SEO, accessibility, performance, responsiveness, broken links, images, console errors, network issues, and more.

QA Check detects the project framework first, selects the correct QA pipeline, and runs only the checks that apply to that framework.

## ✨ Features

- ✅ Automatic framework detection
- ✅ Framework-specific QA pipelines
- ✅ Build validation
- ✅ ESLint validation
- ✅ TypeScript validation
- ✅ Responsive design audit
- ✅ Accessibility audit with axe-core
- ✅ SEO audit
- ✅ Lighthouse performance audit
- ✅ Broken link detection
- ✅ Broken image detection
- ✅ Console error detection
- ✅ Network error detection
- ✅ HTML report generation
- ✅ JSON report generation

## 📦 Installation

Install globally using npm:

```bash
npm install -g qa-check-cli
```

Verify installation:

```bash
qa-check --version
```

## 🚀 Usage

Run QA on the current project:

```bash
qa-check .
```

Run QA on another project:

```bash
qa-check "D:\Projects\Phoenix"
```

Example:

```bash
qa-check "C:\xampp\htdocs\LaravelProject"
```

## 📄 Generated Reports

After the audit finishes, reports are generated inside:

```text
reports/
```

Example:

```text
reports/
    index.html
    report.json
    screenshots/
```

Open:

```text
reports/index.html
```

to view the complete report.

## ✅ Supported Frameworks

Currently supported:

- Next.js
- React
- Vite
- Vue
- Angular
- Nuxt
- Astro
- Laravel
- PHP
- WordPress
- HTML
- React Native
- Flutter
- Swift
- Electron
- Tauri

More frameworks are continuously being added.

## 🔍 Checks Performed

Depending on the detected framework, QA Check automatically runs only the relevant checks.

Examples include:

### Code Quality

- Build validation
- ESLint
- TypeScript

### UI

- Responsive design
- Accessibility
- Performance

### SEO

- Title
- Meta description
- Canonical
- Open Graph
- Twitter Cards
- Structured data

### Network

- Broken links
- Broken images
- Console errors
- Failed requests

### Lighthouse

- Performance
- Accessibility
- SEO
- Best Practices

## 📊 Sample Output

```text
QA CHECK

Framework : Next.js

Pipeline : Next.js

Pages : 40

✔ Build
✔ ESLint
✔ TypeScript
✔ Responsive
✔ Accessibility
✔ Performance
✔ Lighthouse

Overall Score

92/100
```

## 📋 Requirements

- Node.js 20 or later
- Google Chrome, for Lighthouse
- npm

Some framework-specific pipelines may require their native tools, such as PHP/Composer for Laravel or Flutter/Dart for Flutter projects.

## 🔄 Updating

Update to the latest version:

```bash
npm update -g qa-check-cli
```

## 🐞 Issues

Found a bug?

Please open an issue on GitHub. Repository link coming soon.

## 📝 License

MIT License

## 👨‍💻 Author

**Zeel Patel**

QA Check CLI is an open-source project focused on making quality assurance fast, consistent, and framework-aware.
