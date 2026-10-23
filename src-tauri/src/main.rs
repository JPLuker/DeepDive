// Desktop entry point.
//
// Everything the shell does lives in lib.rs, because Android builds
// the crate as a library and never runs this file. Keeping this to a
// single call is what stops the two platforms from drifting: there is
// nothing here that mobile could miss.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    deepdive_lib::run()
}
