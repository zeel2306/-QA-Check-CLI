import chalk from "chalk";
export function printResult(title, result) {
    console.log(title);
    if (result.success) {
        console.log(chalk.green("✔ Passed\n"));
    }
    else {
        console.log(chalk.red("❌ Failed"));
        if (result.stderr) {
            console.log(chalk.yellow(result.stderr));
        }
        const VERBOSE = process.argv.includes("--verbose");
        if (VERBOSE && result.stdout) {
            console.log(chalk.gray(result.stdout));
        }
        console.log();
    }
}
