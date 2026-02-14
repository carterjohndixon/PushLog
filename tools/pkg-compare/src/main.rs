//! pkg-compare: fast package.json diff for deploy decisions
//!
//! Usage:
//!   pkg-compare <file1> <file2>     # compare two package.json files
//!   pkg-compare <file1> <file2> -q # quiet: exit 0 if same, 1 if different
//!
//! Compares dependencies and devDependencies. Use in deploy scripts to decide
//! whether to run `npm install`.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::process;

type Deps = BTreeMap<String, String>;

#[derive(serde::Deserialize, Default)]
struct PackageJson {
    #[serde(default)]
    dependencies: Deps,
    #[serde(default, rename = "devDependencies")]
    dev_dependencies: Deps,
}

fn load_deps(path: &str) -> (Deps, Deps) {
    let contents = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("pkg-compare: cannot read {}: {}", path, e);
        process::exit(2);
    });
    let pkg: PackageJson = serde_json::from_str(&contents).unwrap_or_else(|e| {
        eprintln!("pkg-compare: invalid JSON in {}: {}", path, e);
        process::exit(2);
    });
    (pkg.dependencies, pkg.dev_dependencies)
}

fn flatten(deps: &Deps, dev: &Deps) -> Deps {
    let mut all = deps.clone();
    for (name, v) in dev {
        all.entry(name.clone()).or_insert_with(|| v.clone());
    }
    all
}

fn compare(all_a: &Deps, all_b: &Deps) -> (Vec<String>, Vec<String>, Vec<(String, String, String)>) {
    let mut only_a = Vec::new();
    let mut only_b = Vec::new();
    let mut changed = Vec::new();

    let all_names: std::collections::BTreeSet<_> =
        all_a.keys().chain(all_b.keys()).cloned().collect();

    for name in all_names {
        let v_a = all_a.get(&name).map(|s| s.as_str()).unwrap_or("");
        let v_b = all_b.get(&name).map(|s| s.as_str()).unwrap_or("");
        if v_a.is_empty() {
            only_b.push(format!("{}@{}", name, v_b));
        } else if v_b.is_empty() {
            only_a.push(format!("{}@{}", name, v_a));
        } else if v_a != v_b {
            changed.push((name.clone(), v_a.to_string(), v_b.to_string()));
        }
    }
    (only_a, only_b, changed)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let quiet = args.iter().any(|a| a == "-q" || a == "--quiet");
    let files: Vec<_> = args.iter().filter(|a| !a.starts_with('-')).skip(1).collect();

    if files.len() != 2 {
        eprintln!("Usage: pkg-compare <file1> <file2> [-q|--quiet]");
        eprintln!("  -q  Quiet: only exit code (0=same, 1=different)");
        process::exit(2);
    }

    let (deps_a, dev_a) = load_deps(&files[0]);
    let (deps_b, dev_b) = load_deps(&files[1]);
    let all_a = flatten(&deps_a, &dev_a);
    let all_b = flatten(&deps_b, &dev_b);
    let (only_a, only_b, changed) = compare(&all_a, &all_b);

    let has_diff = !only_a.is_empty() || !only_b.is_empty() || !changed.is_empty();

    if quiet {
        process::exit(if has_diff { 1 } else { 0 });
    }

    if !has_diff {
        println!("No differences.");
        process::exit(0);
    }

    for p in &only_a {
        println!("- {}", p);
    }
    for p in &only_b {
        println!("+ {}", p);
    }
    for (name, v_a, v_b) in &changed {
        println!("~ {}: {} -> {}", name, v_a, v_b);
    }

    process::exit(1);
}
