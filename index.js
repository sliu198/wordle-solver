const path = require('path');
const {readFileSync} = require('fs');
const {compact, reduce, sample} = require('lodash');

const ALL_ANSWERS = loadFile('answer-list');
const ALL_GUESSES = ALL_ANSWERS.concat(loadFile('guess-list'));


class Solver {
  constructor() {
    this.guessCount = 0;
    this.answers = [...ALL_ANSWERS];
    // this.setNextGuess();

    // shortcut, since optimal first guess will never change
    this.nextGuess = 'soare';

    // if the first word must be in the answers
    // this.nextGuess = 'raise';

    this.buckets = makeBuckets(this.nextGuess, this.answers);
  }

  /**
   * Eliminates impossible solutions based on the response and
   *
   * @param {string} response - a five-character string of 0s, 1s, and 2s representing the response.
   * 0 means not in answer, 1 means wrong position, 2 means correct letter and position
   * @returns {string} - the optimal next guess
   */
  setResponse(response) {
    if (!/^[0-2]{5}$/.test(response)) {
      throw new Error('invalid response')
    }
    const answers = this.buckets[response];
    if (!answers || !answers.length) {
      throw new Error('no answers remaining');
    }
    this.answers = answers;

    this.setNextGuess()

    this.guessCount += 1;
    return this.nextGuess;
  }

  /**
   * Sets the next guess, to the given word, or reset it to the optimal word.
   *
   * @param {string} [guess] - set the next guess to this value.
   * Or if not provided, sets the next guess to the optimal one
   * @return {string} - the next guess
   */
  setNextGuess(guess) {
    if (!guess) {
      const {guess, buckets} = getBestNextGuess(
        this.answers,
          {
            // guess a valid answer if there are few enough remaining, otherwise allow full list
            guesses: this.answers.length + this.guessCount <= 6 ? this.answers : undefined
          }
      );
      this.nextGuess = guess;
      this.buckets = buckets;
      return this.nextGuess;
    }

    if(!/^[A-Za-z]{5}$/.test(guess)) {
      throw new Error('invalid guess');
    }

    this.nextGuess = guess.toLowerCase();
    this.buckets = makeBuckets(this.nextGuess, this.answers);
    return this.nextGuess;
  }
}

module.exports = Solver;

function getBestNextGuess(answers, {guesses = ALL_GUESSES} = {}) {
  let best;
  let bestEntropy = -1;
  for (const guess of guesses) {
    const buckets = makeBuckets(guess, answers);
    const entropy = reduce(buckets, (prev, candidates) => {
      const p = candidates.length / answers.length;
      return prev - p * Math.log2(p);
    }, 0)
    if (entropy > bestEntropy) {
      best = [{guess, buckets}];
      bestEntropy = entropy;
    } else if (entropy === bestEntropy) {
      best.push({guess, buckets});
    }
  }

  return sample(best);
}

function makeBuckets(guess, answers) {
  const buckets = {};
  for (const answer of answers) {
    const index = evaluateGuess(answer, guess);
    (buckets[index] || (buckets[index] = [])).push(answer);
  }

  return buckets;
}

function evaluateGuess(answer, guess) {
  const aLetters = answer.split('');
  const gLetters = guess.split('');

  const response = new Array(5).fill(0);
  // letter -> count
  const earlierAnswerLetters = {};
  // letter -> array<position>
  const earlierGuessLetters = {};

  for (let i = 0; i < 5; i++) {
    const a = aLetters[i];
    const g = gLetters[i];

    // exact match
    if (a === g) {
      response[i] = 2;
      continue;
    }

    // appears earlier in answer
    const earlierA = earlierAnswerLetters[g];
    if (earlierA) {
      earlierAnswerLetters[g] -= 1;
      response[i] = 1;
    } else {
      (earlierGuessLetters[g] || (earlierGuessLetters[g] = [])).push(i);
    }

    // appears earlier in guess
    const earlierG = earlierGuessLetters[a]
    if (earlierG && earlierG.length) {
      const [earlierIndex] = earlierG.splice(0, 1);
      response[earlierIndex] = 1;
    } else {
      earlierAnswerLetters[a] = (earlierAnswerLetters[a] || 0) + 1;
    }
  }

  return response.join('');
}

function loadFile(filename) {
  return compact(readFileSync(path.join(__dirname, filename)).toString().split('\n'));
}
