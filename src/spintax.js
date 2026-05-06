export function parseSpintax(text) {
    if (!text) return "";
    
    const spintaxRegex = /\{([^{}]*)\}/g;
    
    let parsedText = text;
    // Gunakan loop while untuk mendukung spintax bersarang (misal: {A|{B|C}})
    while (spintaxRegex.test(parsedText)) {
        parsedText = parsedText.replace(spintaxRegex, (match, choices) => {
            const options = choices.split('|');
            const randomOption = options[Math.floor(Math.random() * options.length)];
            return randomOption;
        });
    }
    
    return parsedText;
}
