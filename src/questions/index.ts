import { resolve as resolvePath } from "path";
import { readdirSync } from "fs";
import { QuestionTree, AnswerMap } from "../types/questions.js";
import chalk from "chalk";


/**
 *
 * @param question
 * @param nextQuestion
 * @param defaultResponse
 */
function _getYesNoValidator(question: QuestionTree, nextQuestion?: QuestionTree, defaultResponse?: "y" | "n" ) {
    return (rawInput: string, answers: AnswerMap) => {
        const normalizedInput = rawInput.toLowerCase();

        if (defaultResponse && !normalizedInput) {
            answers[question.name] = defaultResponse === "y";
            return nextQuestion;
        } else if (normalizedInput === "y" || normalizedInput === "n") {
            answers[question.name] = normalizedInput === "y";
            return nextQuestion;
        } else {
            console.log(chalk.red("Sorry, but I didn't understand your answer. Please select Y or N,\n" +
                "or just hit enter if you want the default.\n"));
            return question;
        }
    };
}


const _outputDirQuestion: QuestionTree = {
    name: "outputPath",
    prompt: "Where should we create the config files for this network? Please\n" +
    "choose either an empty directory, or a path to a new directory that does\n" +
    "not yet exist. Default: ./besu-test-network",
    transformerValidator: (rawInput: string, answers: AnswerMap) => {
        // TODO: add some more checks to make sure that the path is valid
        if (rawInput) {
            answers.outputPath = rawInput;
        } else {
            answers.outputPath = "./besu-test-network";
        }

        try {
            const files = readdirSync(resolvePath(answers.outputPath as string));
            if (files.length > 0) {
                console.log(chalk.red(
                    `Whoops! It appears that the directory that you've chosen, ${answers.outputPath as string}\n` +
                    `already contains some files. Please clear the directory before continuing, or choose\n` +
                    `a different one.\n`
                ));
                return _outputDirQuestion;
            }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (err.code as string === "ENOENT") {
                return undefined;
            } else {
                console.log(chalk.red(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    `Whoops! There was an error when checking your output directory (${err.code as string}). Please\n` +
                    `choose a different one before proceeding.\n`
                ));
                return _outputDirQuestion;
            }
        }

        // this is a no-op, but it makes the TS compiler happy :-/
        return undefined;
    }
};

const _chainlensQuestion: QuestionTree = {
    name: "chainlens",
    prompt: "Do you wish to enable the Chainlens explorer? [N/y]",
};
// have to add this below the definition because of the self reference..
_chainlensQuestion.transformerValidator = _getYesNoValidator(_chainlensQuestion, _outputDirQuestion, "n");

const _otelQuestion: QuestionTree = {
    name: "otel",
    prompt: "Add Otel Collector spans to Grafana? Default: [N/y]",
};
_otelQuestion.transformerValidator = _getYesNoValidator(_otelQuestion, _chainlensQuestion, "n");

const bannerText = String.raw`
         ____                                         
        / __ )___  _______  __                        
       / __  / _ \/ ___/ / / /                        
      / /_/ /  __(__  ) /_/ /                         
     /_____/\___/____/\__,_/  __                      
        / __ \___ _   _____  / /___  ____  ___  _____ 
       / / / / _ \ | / / _ \/ / __ \/ __ \/ _ \/ ___/ 
      / /_/ /  __/ |/ /  __/ / /_/ / /_/ /  __/ /     
     /_____/\___/|___/\___/_/\____/ .___/\___/_/      
       ____        _      __     /_/__             __ 
      / __ \__  __(_)____/ /_______/ /_____ ______/ /_
     / / / / / / / / ___/ //_/ ___/ __/ __ / ___/ __/
    / /_/ / /_/ / / /__/ ,< (__  ) /_/ /_/ / /  / /_  
    \___\_\__,_/_/\___/_/|_/____/\__/\__,_/_/   \__/                                                
`;

const leadInText = `
\n
Welcome to the Besu Developer Quickstart utility. This tool can be used
to rapidly generate a local public node or private network for development purposes.

To get started, be sure that you have both Docker and Docker Compose
installed, then answer the following questions.\n\n`;

export const rootQuestion: QuestionTree = {
    name: "networkType",
    prompt: `${bannerText}${leadInText}What type of network would you like the client to run? Default: [1]`,
    options: [
        { label: "Private", value: "private", nextQuestion: _otelQuestion, default: true },
        { label: "Public", value: "public", nextQuestion: _otelQuestion }
    ]
};

