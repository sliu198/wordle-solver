const path = require('path');
const {readFileSync} = require('fs');
const {compact, reduce, sample, assign} = require('lodash');

const VALID_ANSWERS = loadFile('answer-list');
const VALID_NON_ANSWERS = loadFile('guess-list');

class Solver {
  constructor() {
    this.guessCount = 0;
    this.answers = [...VALID_ANSWERS];

    // // in case we want to recompute the initial best guess
    // this.setNextGuess();

    // shortcut, since optimal first guess will never change
    this.nextGuess = 'soare';
    this.buckets = makeBuckets(this.nextGuess, this.answers);
  }

  /**
   * Eliminates impossible solutions based on the response and sets the optimal next guess
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
    if (!guess && this.guessCount) {
      const {guess, buckets} = getBestNextGuess(this.answers);
      this.nextGuess = guess;
      this.buckets = buckets;
      return this.nextGuess;
    }

    // avoid recomputing initial best guess
    if (!this.guessCount) {
      guess = 'soare'
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
assign(Solver, {
  VALID_NON_ANSWERS,
  VALID_ANSWERS,
  getBestNextGuess,
  makeBuckets,
  computeExpectedRemaining,
  evaluateGuess,
})

function getBestNextGuess(answers, {guesses = [...VALID_ANSWERS, ...VALID_NON_ANSWERS]} = {}) {
  let best;
  let bestExpectedRemaining = Infinity;
  for (const guess of guesses) {
    const buckets = makeBuckets(guess, answers);
    const expectedRemaining = computeExpectedRemaining(buckets);

    const data = {guess, buckets}
    if (expectedRemaining < bestExpectedRemaining) {
      best = [data];
      bestExpectedRemaining = expectedRemaining;
    } else if (expectedRemaining === bestExpectedRemaining) {
      best.push(data);
    }
  }

  // tiebreaker: prioritize possible answers
  const bestAnswers = best.filter(b => !!b.buckets['22222']);

  return sample(bestAnswers) || sample(best);
}

function makeBuckets(guess, answers) {
  const buckets = {};
  for (const answer of answers) {
    const index = evaluateGuess(answer, guess);
    (buckets[index] || (buckets[index] = [])).push(answer);
  }

  return buckets;
}

/**
 * Computes the metric used compare guesses.
 *
 * @param buckets
 * @returns {number}
 */
function computeExpectedRemaining(buckets) {
  const {'22222': answer, ...restBuckets} = buckets;

  const {sumXLogX, total} = reduce(restBuckets, ({sumXLogX, total}, candidates) => {
    const {length} = candidates;
    total += length;
    sumXLogX += length * Math.log2(length);
    return {sumXLogX, total};
  }, {sumXLogX: 0, total: 0} )

  if (total === 0) {
    return answer ? 0 : NaN;
  }

  const entropy = Math.log2(total) - sumXLogX / total
  const powEntropy =  Math.pow(2, entropy);

  return answer ? Math.pow(total, 2) / (total + 1) / powEntropy : total / powEntropy;
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
