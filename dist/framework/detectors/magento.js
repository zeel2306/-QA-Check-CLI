import { detected, hasComposerDependency, notDetected } from "../utils.js";
export class MagentoDetector {
    name = "Magento";
    priority = 850;
    detect(context) {
        if (hasComposerDependency(context, "magento/product-community-edition") ||
            hasComposerDependency(context, "magento/product-enterprise-edition") ||
            context.hasAnyFile(["bin/magento", "app/etc/env.php"])) {
            return detected(this.name, context, {
                version: context.composerDependencyVersion("magento/product-community-edition") ??
                    context.composerDependencyVersion("magento/product-enterprise-edition"),
                language: "PHP",
                packageManager: "composer",
            });
        }
        return notDetected(this.name);
    }
}
