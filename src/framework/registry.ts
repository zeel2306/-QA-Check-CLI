import { AndroidDetector } from "./detectors/android.js";
import { AngularDetector } from "./detectors/angular.js";
import { AspNetDetector } from "./detectors/aspnet.js";
import { AstroDetector } from "./detectors/astro.js";
import { BootstrapDetector } from "./detectors/bootstrap.js";
import { BulmaDetector } from "./detectors/bulma.js";
import { CodeIgniterDetector } from "./detectors/codeigniter.js";
import { DjangoDetector } from "./detectors/django.js";
import { DrupalDetector } from "./detectors/drupal.js";
import { ElectronDetector } from "./detectors/electron.js";
import { ExpoDetector } from "./detectors/expo.js";
import { ExpressDetector } from "./detectors/express.js";
import { FastAPIDetector } from "./detectors/fastapi.js";
import { FastifyDetector } from "./detectors/fastify.js";
import { FlaskDetector } from "./detectors/flask.js";
import { FlutterDetector } from "./detectors/flutter.js";
import { GatsbyDetector } from "./detectors/gatsby.js";
import { GhostDetector } from "./detectors/ghost.js";
import { HonoDetector } from "./detectors/hono.js";
import { HtmlDetector } from "./detectors/html.js";
import { JoomlaDetector } from "./detectors/joomla.js";
import { KoaDetector } from "./detectors/koa.js";
import { KotlinDetector } from "./detectors/kotlin.js";
import { LaravelDetector } from "./detectors/laravel.js";
import { MagentoDetector } from "./detectors/magento.js";
import { NestDetector } from "./detectors/nest.js";
import { NextDetector } from "./detectors/next.js";
import { NuxtDetector } from "./detectors/nuxt.js";
import { PhpDetector } from "./detectors/php.js";
import { QwikDetector } from "./detectors/qwik.js";
import { ReactNativeDetector } from "./detectors/react-native.js";
import { ReactDetector } from "./detectors/react.js";
import { RemixDetector } from "./detectors/remix.js";
import { ShopifyThemeDetector } from "./detectors/shopify.js";
import { SolidDetector } from "./detectors/solid.js";
import { SpringBootDetector } from "./detectors/spring-boot.js";
import { SvelteKitDetector } from "./detectors/sveltekit.js";
import { SvelteDetector } from "./detectors/svelte.js";
import { SwiftUIDetector } from "./detectors/swiftui.js";
import { SwiftDetector } from "./detectors/swift.js";
import { SymfonyDetector } from "./detectors/symfony.js";
import { TailwindDetector } from "./detectors/tailwind.js";
import { TauriDetector } from "./detectors/tauri.js";
import { ViteDetector } from "./detectors/vite.js";
import { VueDetector } from "./detectors/vue.js";
import { WordPressDetector } from "./detectors/wordpress.js";
import type { FrameworkDetector } from "./types.js";

/**
 * Detector registration is the only ordered composition point.
 * Individual detectors do not know about each other; priority decides the
 * winner when several strategies match the same project.
 */
export const detectors: readonly FrameworkDetector[] = [
  new NextDetector(),
  new NuxtDetector(),
  new SvelteKitDetector(),
  new ExpoDetector(),
  new LaravelDetector(),
  new SwiftUIDetector(),
  new ReactNativeDetector(),
  new AngularDetector(),
  new RemixDetector(),
  new GatsbyDetector(),
  new FlutterDetector(),
  new AstroDetector(),
  new QwikDetector(),
  new SolidDetector(),
  new TauriDetector(),
  new ElectronDetector(),
  new WordPressDetector(),
  new SymfonyDetector(),
  new DrupalDetector(),
  new JoomlaDetector(),
  new MagentoDetector(),
  new NestDetector(),
  new DjangoDetector(),
  new SpringBootDetector(),
  new AspNetDetector(),
  new CodeIgniterDetector(),
  new VueDetector(),
  new ShopifyThemeDetector(),
  new SvelteDetector(),
  new GhostDetector(),
  new ReactDetector(),
  new FastAPIDetector(),
  new ExpressDetector(),
  new FastifyDetector(),
  new HonoDetector(),
  new KoaDetector(),
  new ViteDetector(),
  new AndroidDetector(),
  new SwiftDetector(),
  new KotlinDetector(),
  new PhpDetector(),
  new TailwindDetector(),
  new BootstrapDetector(),
  new BulmaDetector(),
  new HtmlDetector(),
].sort((a, b) => b.priority - a.priority);
