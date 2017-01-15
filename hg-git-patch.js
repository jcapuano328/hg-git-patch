const os = require('os');
const path = require('path');
const fs = require('fs');
const run = require('child_process').spawnSync;
const program = require('commander');
/*
Export:
	hg repository folder
	hg revision(s)

Import:
	git repository folder

Processing:
	loop over each revision
	execute hg log -r <revision> -R <hg repo folder> and retrieve the commit message
	execute hg export -g -r <revision> -R <hg repo folder> to retrieve the patch
	necessary evil: create a tempfile for the patch
	execute git -C <git repo folder> apply --ignore-whitespace <tempfile>
	execute git -C <git repo folder> add .
	execute git -C <git repo folder> commit -m "<commit message>"
*/

let main = (args) => {
	try {
	    console.log('');
	    console.log('Migrate Commits from Hg to Git');
	    console.log('');	
			
		if (!args.hgrepo) {
			console.error('Hg Repository is required!');
			program.help();
			//throw new Error('Invalid Arguments');
			return -1;
		}
		if (!args.gitrepo) {
			console.error('Git Repository is required!');
			program.help();
			//throw new Error('Invalid Arguments');
			return -1;
		}		
		if (!args.revision) {
			console.error('One or more Revisions must be provided!');
			program.help();
			//throw new Error('Invalid Arguments');
			return -1;
		}		
				
		(args.revision || []).forEach((rev) => migrate(rev, args.hgrepo, args.gitrepo));

		console.log('');
		console.log('Done');
		console.log('');

	    return 0;

	} catch(ex) {
		console.error('Failed to migrate commits', ex);
	    return -1;
	}
}

let migrate = (rev, hgrepo, gitrepo) => {
	console.log('Migrate', rev, 'from', hgrepo, 'to', gitrepo);
    let info = getHgCommitInfo(rev, hgrepo);
	//console.log('>>>', rev, message);
	let patch = getHgCommitPatch(rev, hgrepo);
	//console.log(patch);
	applyToGit(rev, patch, info.author, info.date, info.message, gitrepo);
}

let getHgCommitInfo = (rev, hgrepo) => {    
    let res = run('hg', ['log', '-r', rev, '-R', hgrepo]);
	if (res.status == 0) {		
		let out = res.stdout.toString();
		let info = {author: '', date: '', message: ''};
		let m = (/user:(.*)\ndate:/g).exec(out);
		if (m && m.length > 1) {
			info.author = m[1].replace(/^\s*/, '');
		}		

		m = (/date:(.*)\nsummary:/g).exec(out);
		if (m && m.length > 1) {
			info.date = m[1].replace(/^\s*/, '');
		}

		m = (/summary:(.*)\n\n$/g).exec(out);
		if (m && m.length > 1) {
			info.message = m[1].replace(/^\s*/, '');
		}		

		return info;
	}	
	throw new Error('Failed to retrieve details for commit ' + rev); 
}

let getHgCommitPatch = (rev, hgrepo) => {	
    let res = run('hg', ['export', '-g', '-r', rev, '-R', hgrepo]);
	if (res.status != 0) {
		throw new Error('Failed to export patch for commit ' + rev);
	}	
	return res.stdout.toString();
}

let applyToGit = (rev, patch, author, date, message, gitrepo) => {
	let tmpfile = path.join(os.tmpdir(), (rev + '.patch'));
	fs.writeFileSync(tmpfile, patch);	
	try {
		let res = run('git', ['-C', gitrepo, 'apply', '--ignore-whitespace', tmpfile]);
		if (res.status != 0) {
			throw new Error('Failed to apply patch for commit ' + rev + ', ' + message + ': ' + res.stderr);
		}
		res = run('git', ['-C', gitrepo, 'add', '.']);
		if (res.status != 0) {
			throw new Error('Failed to stage patch for commit ' + rev + ', ' + message + ': ' + res.stderr);
		}
		res = run('git', ['-C', gitrepo, 'commit', '--author', author, '--date', date, '-m', message]);
		if (res.status != 0) {
			throw new Error('Failed to commit patch for commit ' + rev + ', ' + message + ': ' + res.stderr);
		}
	} catch(e) {
		fs.unlinkSync(tmpfile);
		throw e;
	}
}


program
	.version('0.0.1')
	.description('Migrate commits from Hg to Git')
	.option('-r, --revision [c]', 'Revision(s)', (val, memo) => {memo.push(val);return memo;}, [])
	.option('-h, --hgrepo <s>', 'Hg Respository folder')
	.option('-g, --gitrepo <s>', 'Git Repository folder')
	.parse(process.argv);

main(program);
