var gulp = require('gulp');
var gutil = require('gulp-util');
var shell = require('gulp-shell');
var downloadatomshell = require('gulp-download-atom-shell');
var path = require('path');
var os = require('os');
var fs = require('fs');
var wrench = require('wrench');
var atomGyp, version, gypPath, cloneDir, atomDir, replaceGyp, copyProjectContentSync, isAtomRepoExist, cloneAtomRepo, updateAtomRepo, buildAtom, bootstrapAtom, buildNoBootstrap, repoUrl, checkoutVersion, generateNodeLib, rebuildNativeModules, projectName, productName, frameworkName;

projectName = 'testProjectName';
productName = 'TestProductName';
frameworkName = 'Fireball Framework';
version = 'v0.19.5';
cloneDir = os.tmpDir();
atomDir = path.join(cloneDir, 'downloaded-atom-shell-repo');
gypPath = path.join(atomDir, 'atom.gyp');
repoUrl = 'https://github.com/atom/atom-shell';

isAtomRepoExist = function() {
  return fs.existsSync(path.join(atomDir, '.git'));
};

cloneAtomRepo = function(cb) {
  var stream = shell([
    'git clone https://github.com/atom/atom-shell.git downloaded-atom-shell-repo'
  ], {
    cwd: cloneDir
  });

  stream.write(process.stdout);
  stream.end();
  stream.on('finish', cb);
  return stream;
};

checkoutVersion = function(cb) {
  var stream = shell([
    'git checkout ' + version,
    'git reset --hard HEAD'
  ], {
    cwd: atomDir
  });
  stream.write(process.stdout);
  stream.end();
  stream.on('finish', cb);
  return stream;
};



updateAtomRepo = function(callback) {
  var stream = shell([
    'git reset --hard HEAD',
    'git pull origin master',
    'git checkout ' + version
  ], {
    cwd: atomDir
  });

  stream.write(process.stdout);
  stream.end();
  stream.on('finish', callback);
  return stream;
};

bootstrapAtom = function(cb) {
  var stream = shell([
    'python script/bootstrap.py -v'
  ], {
    cwd: atomDir
  });
  stream.write(process.stdout);
  stream.end();
  stream.on('finish', cb);
  return stream;
};

buildAtom = function(cb) {
  bootstrapAtom(function() {
    buildNoBootstrap(cb);
  });
};

buildNoBootstrap = function(cb) {
  var cmds = ['python script/build.py -c Release -t ' + projectName];
  if (!fs.existsSync(path.join(atomDir, 'out/Release'))) {
    cmds.unshift('mkdir out', 'mkdir out/Release');
  }
  var stream = shell(cmds, {
    cwd: atomDir
  });

  stream.write(process.stdout);
  stream.end();
  stream.on('finish', cb);
  return stream;
};

copyProjectContentSync = function() {
    var appPath = path.join(atomDir, 'out/Release', productName);
    if (process.platform === 'win32') {
        appPath += 'resources/app';
    } else if (process.platform === 'darwin') {
        appPath += '.app/Contents/Resources/app';
    }
    wrench.rmdirSyncRecursive(path.join(atomDir,'out/Release', productName+'.app', 'Contents','Resources','default_app'), false);
    wrench.copyDirSyncRecursive(__dirname, appPath, {
        forceDelete: true,
        excludeHiddenUnix: false,
        inflateSymlinks: false,
        exclude: /binaries|node_modules|gulpfile.js/
    });

    var source = path.join(atomDir, 'out/Release', productName);
    var dest = path.join(__dirname, productName);
    if (process.platform === 'darwin') {
        source += '.app';
        dest += '.app';
    }
    wrench.copyDirSyncRecursive(source, dest, {
        forceDelete: true,
        excludeHiddenUnix: false,
        inflateSymlinks: false
    });
};

replaceGyp = function(cb) {
  if (fs.existsSync(gypPath)) {
    atomGyp = fs.readFileSync(gypPath, {
      encoding: 'utf8'
    });
    atomGyp = atomGyp
      .replace("'project_name': 'atom'", "'project_name': " + "'" + projectName + "'")
      .replace("'product_name': 'Atom'", "'product_name': " + "'" + productName + "'")
      .replace("'framework_name': 'Atom Framework'", "'framework_name': " + "'" + frameworkName + "'");
    fs.writeFile(gypPath, atomGyp, function() {
      cb();
    });
  } else {
    console.log("atom.gyp doesn't exist!");
    cb();
  }
};

generateNodeLib = function(cb) {
  var atomHome, homeDir, nodeGypHome, source, target, _ref1;
  if (process.platform !== 'win32') {
    return;
  }
  homeDir = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  atomHome = (_ref1 = process.env.ATOM_HOME) != null ? _ref1 : path.join(homeDir, "." + projectName);
  nodeGypHome = path.join(atomHome, '.node-gyp');
  source = path.resolve(atomDir, 'out', 'Release', 'node.lib');
  target = path.resolve(nodeGypHome, '.node-gyp', '0.18.0', 'ia32', 'node.lib');
  if (fs.existsSync(source) && (forceRebuild == null)) {
    gulp.src(source).pipe(gulp.dest(target));
    return;
  }
  var stream = shell([
    'python script/build.py -c Release -t generate_node_lib'
  ], {
    cwd: atomDir
  });

  stream.write(process.stdout);
  stream.end();
  stream.on('finish', function() {
    gulp.src(source).pipe(gulp.dest(target));
    cb();
  });
  return stream;
};

rebuildNativeModules = function(cb) {
  var args, atomHome, cmd, env, homeDir, nodeArch, nodeGypHome, nodeVersion, _ref1, _ref2;
  nodeArch = (function() {
    switch (process.platform) {
      case 'darwin':
        return 'x64';
      case 'win32':
        return 'ia32';
      default:
        return process.arch;
    }
  })();
  nodeVersion = (_ref1 = process.env.ATOM_NODE_VERSION) != null ? _ref1 : '0.18.0';
  homeDir = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  atomHome = (_ref2 = process.env.ATOM_HOME) != null ? _ref2 : path.join(homeDir, "." + projectName);
  nodeGypHome = path.join(atomHome, '.node-gyp');
  args = ['node', require.resolve('npm/bin/npm-cli'), 'rebuild', "--target=" + nodeVersion, "--arch=" + nodeArch];
  env = _.extend({}, process.env, {
    HOME: nodeGypHome
  });
  if (process.platform === 'win32') {
    env.USERPROFILE = env.HOME;
  }
  var stream = shell([
    args.join(' ')
  ], {
    env: env
  });
  stream.write(process.stdout);
  stream.end();
  stream.on('finish', cb);
};


// tasks

gulp.task('get-atom-shell', function(cb) {
  if (isAtomRepoExist()) {
    updateAtomRepo(cb);
  } else {
    cloneAtomRepo(cb);
  }
});

gulp.task('build-release', ['get-atom-shell'], function(cb) {
  checkoutVersion(function() {
    replaceGyp(function() {
      buildAtom(function() {
        console.log("finish build release!");
        copyProjectContentSync();
        cb();
      });
    });
  });
});

gulp.task('build-no-bootstrap', ['get-atom-shell'], function(cb) {
  //  checkoutVersion(function() {
  replaceGyp(function() {
    buildNoBootstrap(function() {
      console.log("finish build without bootstrap!");
      cb();
    });
  });
  //  });
});

gulp.task('bootstrap-atom', ['get-atom-shell'], shell.task([
  'python script/bootstrap.py -v'
], {
  cwd: atomDir
}));

gulp.task('copy-content', function(cb) {
    copyProjectContentSync();

    cb();
});

gulp.task('downloadatomshell', function(cb) {
  downloadatomshell({
    version: '0.19.4',
    outputDir: 'binaries'
  }, cb);
});

gulp.task('open-atom', shell.task([
  'binaries/Atom.app/Contents/MacOS/Atom .'
]));

gulp.task('open-atom-after-download', ['downloadatomshell'], shell.task([
  'binaries/Atom.app/Contents/MacOS/Atom .'
]));


gulp.task('default', ['open-atom-after-download']);
