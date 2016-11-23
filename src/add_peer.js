'use strict'

const inquirer = require('inquirer')
const crypto = require('crypto')
const valid = require('./validate')
const chalk = require('chalk')
const sodium = require('chloride')
const co = require('co')
const base64url = require('base64url')
const currencies = require('./currency')
const path = require('path')
const fs = require('fs')
const parse = require('./parse')

const printInfo = (s) => {
  console.info(chalk.gray(s))
}

module.exports = co.wrap(function * (output) {

  if (typeof output !== 'string') {
    commander.outputHelp()
    console.error('Missing output file. Specify an env file to output to with "-o" or "--output"')
    process.exit(1)
  } else if (fs.existsSync(output)) {
    printInfo('Will modify "' + output + '". Cancel now if you aren\'t ok with that.')
  } else {
    console.error('"' + output + '" does not yet exist. Run \'configure\' to create it.')
    process.exit(1)
  }

  const answers = yield inquirer.prompt([
    { type: 'input',
      name: 'broker',
      message: 'What MQTT broker will you be using?',
      validate: (a) => !!(a.length),
      // TODO: should this have a real test broker in here?
      default: 'mqtt://broker.hivemq.com:1883'},

    { type: 'input',
      name: 'secret',
      message: 'What is your (base64url encoded) secret?',
      validate: (a) => !!(a.length > 1) },

    { type: 'input',
      name: 'publicKey',
      message: 'What is your peer\'s (base64url encoded) public key?',
      validate: (a) => !!(a.length === 43) },

    { type: 'input',
      name: 'currency',
      message: 'What is your currency code?',
      validate: valid.validateCurrency,
      default: 'USD' },

    { type: 'input',
      name: 'maxBalance',
      message: (a) => ('What is the max amount (in ' + a.currency + ') that you can be owed?'),
      validate: valid.validateNumber,
      default: '10' }
  ])

  const token = base64url(sodium.crypto_scalarmult(
    sodium.crypto_hash_sha256(base64url.toBuffer(answers.secret)),
    base64url.toBuffer(answers.publicKey)
  ))
  
  const ledgerName = 'peer.' + token.substring(0, 5) + '.'
  const ledger = {
    currency: answers.currency,
    plugin: 'ilp-plugin-virtual',
    options: {
      secret: answers.secret,
      peerPublicKey: answers.publicKey,
      prefix: ledgerName,
      broker: answers.broker,
      maxBalance: answers.maxBalance,
      _store: path.join(process.cwd(), 'store.' + ledgerName + 'db'),
      info: {
        currencyCode: answers.currency,
        currencySymbol: currencies[answers.currency] || answers.currency,
        precision: 10,
        scale: 10,
        connectors: [{
          id: answers.publicKey,
          name: answers.publicKey,
          connector: ledgerName + answers.publicKey
        }]
      }
    }
  }

  yield parse(output, function * (variable, value) {
    if (variable === 'CONNECTOR_LEDGERS') {
      const ledgers = JSON.parse(value)
      if (ledgers[ledgerName]) {
        printInfo('overwriting existing entry for "' + ledgerName + '"')
      }
      ledgers[ledgerName] = ledger
      return JSON.stringify(ledgers)
    }
    return value
  })
})
