// ==================== TEST CASE ANALYZER ====================
// Generates and assesses test case coverage for coding problems

function generateTestCasesForQuestion(questionTitle, questionDescription) {
    // Generate additional test cases based on problem description
    const testCases = [];
    
    const title = (questionTitle || '').toLowerCase();
    const desc = (questionDescription || '').toLowerCase();
    
    // Test cases for "Remove Leading/Trailing/Internal Spaces"
    if (title.includes('leading') || title.includes('trailing') || title.includes('spaces')) {
        testCases.push(
            { input: '   hello   ', expected: 'hello' },
            { input: 'a b c', expected: 'abc' },
            { input: '  test  input  ', expected: 'testinput' },
            { input: 'no spaces', expected: 'nospaces' }
        );
    }
    
    // Test cases for "Remove Duplicates"
    if (title.includes('remove duplicates') || desc.includes('remove duplicate')) {
        testCases.push(
            { input: '[1, 1, 1]', expected: '[1]' },
            { input: '[5, 3, 5, 2, 3]', expected: '[5, 3, 2]' },
            { input: '[9]', expected: '[9]' },
            { input: '[]', expected: '[]' }
        );
    }
    
    // Test cases for "Remove Numbers from String"
    if (title.includes('remove number') || desc.includes('remove.*digit')) {
        testCases.push(
            { input: '123', expected: '' },
            { input: 'ABC', expected: 'ABC' },
            { input: 'A1B2C3', expected: 'ABC' },
            { input: '0', expected: '' }
        );
    }
    
    // Test cases for "String Reversal"
    if (title.includes('reverse')) {
        testCases.push(
            { input: 'a', expected: 'a' },
            { input: 'hello', expected: 'olleh' },
            { input: '12345', expected: '54321' }
        );
    }
    
    // Test cases for "Palindrome Check"
    if (title.includes('palindrome')) {
        testCases.push(
            { input: 'a', expected: 'Palindrome' },
            { input: 'racecar', expected: 'Palindrome' },
            { input: 'hello', expected: 'Not a Palindrome' }
        );
    }
    
    // Test cases for "Prime Number Check"
    if (title.includes('prime')) {
        testCases.push(
            { input: '2', expected: 'Prime' },
            { input: '1', expected: 'Not Prime' },
            { input: '17', expected: 'Prime' }
        );
    }
    
    // Test cases for "Pangram Check"
    if (title.includes('pangram')) {
        testCases.push(
            { input: 'abcdefghijklmnopqrstuvwxyz', expected: 'Pangram' },
            { input: 'hello world', expected: 'Not a Pangram' }
        );
    }
    
    // Test cases for "Leap Year Check"
    if (title.includes('leap year')) {
        testCases.push(
            { input: '2000', expected: 'Leap Year' },
            { input: '1900', expected: 'Not a Leap Year' },
            { input: '2021', expected: 'Not a Leap Year' }
        );
    }
    
    // Test cases for "Vowel/Consonant Count"
    if (title.includes('vowel') || title.includes('consonant')) {
        testCases.push(
            { input: 'a', expected: 'vowels: 1, consonants: 0' },
            { input: 'bcdfg', expected: 'vowels: 0, consonants: 5' },
            { input: 'aeiou', expected: 'vowels: 5, consonants: 0' }
        );
    }
    
    // Test cases for "Armstrong Number"
    if (title.includes('armstrong')) {
        testCases.push(
            { input: '371', expected: 'Armstrong number' },
            { input: '100', expected: 'Not an Armstrong number' }
        );
    }
    
    // Test cases for "Factorial"
    if (title.includes('factorial')) {
        testCases.push(
            { input: '0', expected: '1' },
            { input: '1', expected: '1' },
            { input: '5', expected: '120' }
        );
    }
    
    // Test cases for "Fibonacci"
    if (title.includes('fibonacci')) {
        testCases.push(
            { input: '1', expected: '0' },
            { input: '6', expected: '5' },
            { input: '10', expected: '34' }
        );
    }
    
    return testCases;
}

function assessTestCaseCoverage(questionTitle, actualOutput, expectedOutput) {
    // If basic output doesn't match, coverage is 0
    if (actualOutput.trim() !== expectedOutput.trim()) {
        return { 
            passed: 0, 
            total: 1, 
            coverage: 0, 
            message: 'Output does not match expected' 
        };
    }
    
    // Get additional test cases
    const testCases = generateTestCasesForQuestion(questionTitle, '');
    
    if (testCases.length === 0) {
        // No additional test cases available, so 100% of what we know passes
        return { 
            passed: 1, 
            total: 1, 
            coverage: 100, 
            message: 'Primary test case passes (no additional test cases defined)' 
        };
    }
    
    // If we have the actual problem, we'd run the code with each test case
    // For now, we return the assessment that at least the given test case passed
    return { 
        passed: 1, 
        total: testCases.length + 1,  // +1 for the given test case
        coverage: Math.round((1 / (testCases.length + 1)) * 100),
        hasAdditionalTestCases: testCases.length > 0,
        testCases: testCases,  // Include test cases for potential future use
        message: `Primary test case passes (1/${testCases.length + 1} tests covered)`
    };
}

function getTestCaseDetails(questionTitle) {
    // Get detailed test case information for a question
    const testCases = generateTestCasesForQuestion(questionTitle, '');
    return {
        defined: testCases.length > 0,
        count: testCases.length,
        testCases: testCases
    };
}

module.exports = {
    generateTestCasesForQuestion,
    assessTestCaseCoverage,
    getTestCaseDetails
};
