/***********************************************************************
 * LOAD DEPENDENCIES
 ***********************************************************************/
var mymod= require('dns-notfound-what');
var OSMATRIX_SERVICE = require('./service');

/***********************************************************************
 * CONFIG
 ***********************************************************************/

var SERVER = {
	baseUrl: 'osmatrix',
//	port: 9999
	port: 50684

}

var DATABASE = {
	host: null,
	name: null,
	user: null,
	pass: null
}

/**
 * Get the user's password from command line and starts serivce initialization
 */
function getPassword() {
 	var stdin = process.openStdin(),
    	tty = require('tty');

    process.stdout.write('Enter password for user ' + DATABASE.user + ' on database ' + DATABASE.name +': ');
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	process.stdin.setRawMode(true);
	password = ''
	process.stdin.on('data', function (char) {
	    char = char + ""

	    switch (char) {
	    	case "\n": case "\r": case "\u0004":
				// They've finished typing their password
				process.stdin.setRawMode(false);
				console.log('\n\n');
				stdin.pause();
				DATABASE.pass = encodeURIComponent(password);
				initialize();
				break;
	    	case "\u0003":
	    		// Ctrl C
				console.log('Cancelled');
				process.exit();
				break;
			default:
				// More passsword characters
				process.stdout.write('');
				password += char;
				break;
	    }
	});
}

/**
 * Initializes the service
 */
function initialize() {
	// check database config for validity
	
	var valid = true;
	for (key in DATABASE) {
		if (DATABASE[key] === null) {
			valid = false;
			console.error('Database config incomplete: %d is missing', key);
		}
	}

	if (valid) OSMATRIX_SERVICE.initialize(DATABASE, SERVER);
}

/**
 * Initialize the process
 */

// parse command line arguments, shall be provide as node index.js -U [username] -h [host] -d [database name]
var args = process.argv;
var argsObj = {};

for (var i = 2;i < args.length; i++) {
	var argument = args[i];
	var nextArgument = args[i + 1];
	if (argument.indexOf('-') === 0) {
		argument = argument.replace(/^-+/,"");
		if (nextArgument && nextArgument.indexOf('-') !== 0) {
			argsObj[argument] = nextArgument;
			i++;
		} else {
			argsObj[argument] = true;	
		}
	}
}

// Setting database settings
DATABASE.host = argsObj.h;
DATABASE.name = argsObj.d;
DATABASE.user = encodeURIComponent(argsObj.U);

// getting database password
getPassword();