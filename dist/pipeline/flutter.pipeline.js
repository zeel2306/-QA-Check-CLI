import { assetValidation, dartAnalyze, dependencyValidation, flutterDoctor, flutterTest, pubspecValidation, } from "../checks/project.js";
import { BasePipeline } from "./base.js";
export class FlutterPipeline extends BasePipeline {
    framework = "Flutter";
    checks() {
        return [
            flutterDoctor(),
            pubspecValidation(),
            dartAnalyze(),
            flutterTest(),
            dependencyValidation(),
            assetValidation(),
        ];
    }
}
