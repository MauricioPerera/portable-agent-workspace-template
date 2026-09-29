process.stdout.write('LOCKED\n');
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
