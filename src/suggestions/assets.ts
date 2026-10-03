import type { SuggestionMap } from "./types.js";

export const assetSuggestions: SuggestionMap = {
  "missing-image-asset": {
    code: "missing-image-asset",
    title: "Missing Image Asset",
    problem: "An image asset file does not exist on disk.",
    whyItMatters: "Missing image assets display broken layout placeholders to users.",
    suggestedFix: ["Verify image asset filename and deployment path."],
    shortFix: "Verify image asset filename and deployment path.",
  },
  "broken-image-http": {
    code: "broken-image-http",
    title: "Broken Image Response",
    problem: "An image request failed or returned HTTP 404/500.",
    whyItMatters: "Server errors when loading images cause broken visual components.",
    suggestedFix: ["Ensure image server/endpoint is reachable and serving valid image."],
    shortFix: "Ensure image server/endpoint is reachable.",
  },
  "invalid-image-src": {
    code: "invalid-image-src",
    title: "Invalid Image Source",
    problem: "Image src attribute is empty or malformed.",
    whyItMatters: "Empty or malformed image src attributes cause browser loading errors.",
    suggestedFix: ["Provide a valid image path or URL in src attribute."],
    shortFix: "Provide a valid image path or URL in src attribute.",
  },
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
