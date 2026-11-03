export const portableCharterHeadings = [
    "Mission",
    "Responsibilities",
    "Non-responsibilities",
];
function checkHeadingOrder(text, errors) {
    let previous = -1;
    const allHeadings = [...portableCharterHeadings, "Current status / readiness"];
    for (const heading of allHeadings) {
        const escaped = heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw `\$&`);
        const matches = [...text.matchAll(new RegExp(`^## ${escaped}$`, "gm"))];
        if (matches.length !== 1) {
            errors.push(`portable charter: expected exactly one ## ${heading}`);
            continue;
        }
        const current = matches[0]?.index ?? -1;
        if (current <= previous)
            errors.push(`portable charter: heading order invalid at ${heading}`);
        previous = current;
    }
}
function checkSectionContent(heading, content, setupPlaceholder, mode, errors) {
    if (mode === "template-source") {
        if (setupPlaceholder && !content.includes(setupPlaceholder)) {
            errors.push(`portable charter: missing ${setupPlaceholder} in ${heading}`);
        }
        if (!content.includes("<!-- TODO(setup!):")) {
            errors.push(`portable charter: missing setup TODO in ${heading}`);
        }
    }
    else {
        if (setupPlaceholder && content.includes(setupPlaceholder)) {
            errors.push(`portable charter: rejected setup placeholder ${setupPlaceholder} in ${heading}`);
        }
        if (content.includes("TODO(setup!):")) {
            errors.push(`portable charter: rejected setup TODO in ${heading}`);
        }
        if (content.length === 0) {
            errors.push(`portable charter: empty concrete prose in ${heading}`);
        }
    }
}
function checkSections(text, mode, errors) {
    const placeholders = [
        { heading: "Mission", setupPlaceholder: "{{ONE_LINE_DESCRIPTION}}" },
        { heading: "Responsibilities", setupPlaceholder: "{{RESPONSIBILITIES}}" },
        { heading: "Non-responsibilities", setupPlaceholder: "{{NON_GOALS}}" },
        { heading: "Current status / readiness", setupPlaceholder: "" }
    ];
    for (const { heading, setupPlaceholder } of placeholders) {
        const escaped = heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw `\$&`);
        const regex = new RegExp(String.raw `^## ${escaped}\s*\n([\s\S]*?)(?=^## |$)`, "m");
        const match = regex.exec(text);
        if (!match)
            continue; // Already reported missing
        const content = (match[1] || "").trim();
        checkSectionContent(heading, content, setupPlaceholder, mode, errors);
    }
}
export function validateCharter(text, mode) {
    const errors = [];
    checkHeadingOrder(text, errors);
    checkSections(text, mode, errors);
    if (!text.includes("[PRIORITIES.md](./PRIORITIES.md)")) {
        errors.push("portable charter: sibling PRIORITIES.md pointer missing");
    }
    return { valid: errors.length === 0, errors };
}
