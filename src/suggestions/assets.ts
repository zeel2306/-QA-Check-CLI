import type { SuggestionMap } from "./types.js";

export const assetSuggestions: SuggestionMap = {
  "broken-image": {
    code: "broken-image",
    title: "Broken Image",
    problem: "An image could not be loaded successfully.",
    whyItMatters: "Broken images make the page look incomplete and can hurt perceived quality.",
    suggestedFix: ["Verify image exists.", "Check image path.", "Ensure asset is deployed."],
    shortFix: "Verify the image path and deployment.",
  },
  "missing-alt": {
    code: "missing-alt",
    title: "Missing Image Alt Text",
    problem: "An image is missing useful alternative text.",
    whyItMatters: "Assistive technology cannot describe meaningful images without alt text.",
    suggestedFix: ['<img src="..." alt="Meaningful description" />'],
    shortFix: "Add meaningful alt text.",
  },
  "large-image": {
    code: "large-image",
    title: "Large Image",
    problem: "An image asset is larger than expected.",
    whyItMatters: "Large images slow down page loading and waste bandwidth.",
    suggestedFix: ["Compress the image.", "Serve WebP/AVIF.", "Resize to the rendered dimensions."],
    shortFix: "Compress and resize the image.",
  },
};
