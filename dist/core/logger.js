import chalk from "chalk";
const line = "========================================";
export const logger = {
    header() {
        console.log(chalk.cyan(`${line}\n\nQA CHECK v2\n\n${line}\n`));
    },
    section(title) {
        console.log(chalk.cyan(`\n${title}`));
    },
    result(result) {
        const icon = result.status === "PASS" ? "✔" : result.status === "FAIL" ? "✖" : "⚠";
        const text = `${icon} ${result.name}: ${result.status}${result.score === undefined ? "" : ` (${result.score})`}`;
        const color = result.status === "PASS" ? chalk.green : result.status === "FAIL" ? chalk.red : chalk.yellow;
        console.log(color(text));
        if (result.message)
            console.log(chalk.gray(`  ${result.message}`));
    },
    footer(score, reportPath) {
        console.log(chalk.cyan(`\n${line}`));
        console.log(`\nOverall Score\n\n${score}/100\n\nReport\n\n${reportPath}\n`);
        console.log(chalk.cyan(line));
    },
};
