import { invoke } from '@tauri-apps/api/core';
import { appCacheDir, resolve, resourceDir, join } from '@tauri-apps/api/path';
import { remove, readDir, BaseDirectory, rename } from '@tauri-apps/plugin-fs';
import { open, Command } from '@tauri-apps/plugin-shell';
import style from './style.module.scss';
const library = [];
let playButtonStateChangeEvent = new Event("playButtonStateChange", {bubbles: true});

window.gameUpdatingAnimation = '';
window.playButtonIsAvailable = style.isAvailable;
window.playButtonState = 0;

window.updatePlayButtonState = () => {
	switch(true) {
		case isUpdatingGame:
			window.gameUpdatingAnimation = style.show;
			window.playButtonIsAvailable = '';
			window.playButtonState = 1;
			break;
		case isCheckingUpdate:
		case isGameStarting:
			window.gameUpdatingAnimation = '';
			window.playButtonIsAvailable = style.isAvailable;
			window.playButtonState = 1;
			break;
		case isPendingUpdate:
			window.gameUpdatingAnimation = '';
			window.playButtonIsAvailable = style.isAvailable;
			window.playButtonState = 2;
			break;
		case isGameRunning:
			window.gameUpdatingAnimation = style.show;
			window.playButtonIsAvailable = '';
			window.playButtonState = 0;
			break;
		default:
			window.gameUpdatingAnimation = '';
			window.playButtonIsAvailable = style.isAvailable;
			window.playButtonState = 0;
			break;
	}
	return window.playButtonState;
}

library.sleep = ms => new Promise(r => setTimeout(r, ms));

library.initializeEvents = function() {
	if(typeof window.isCheckingUpdate == 'undefined') window.isCheckingUpdate = false;
	if(typeof window.isUpdatingGame == 'undefined') window.isUpdatingGame = false;
	if(typeof window.isGameStarting == 'undefined') window.isGameStarting = false;
	if(typeof window.isGameRunning == 'undefined') window.isGameRunning = false;
	if(typeof window.isPendingUpdate == 'undefined') window.isPendingUpdate = false;
	
	// Not really events
	if(typeof window.new_updates == 'undefined') window.new_updates = [];
}

library.initializeVariables = function() {
	if(typeof localStorage.update_time == 'undefined') localStorage.update_time = 0;
}

library.getSettings = function() {
	library.initializeVariables();
	const resourcePath = "C:\\Users\\megas\\OneDrive\\Рабочий стол\\UNPACKING TEST";
	//const resourcePath = await resourceDir();
	return {
		updates_api_url: "https://updates.gcs.icu/",
		gdps_name: "GreenCatsServer",
		
		update_time: localStorage.update_time,
		resource_path: resourcePath
	}
}

library.checkUpdates = async function() {
	if(window.isCheckingUpdate) return;
	await library.changeIsCheckingUpdateState(true);
	const settings = library.getSettings();
	if(settings.update_time == 0) {
		console.log('You should install game ;)');
		await library.changeIsCheckingUpdateState(false);
		await library.changePendingUpdateState(true);
	} else {
		fetch(settings.updates_api_url + "updates/" + settings.update_time).then(res => res.json()).then(response => {
			if(response.length == 0) {
				console.log("No updates available. Latest version!");
				library.changeIsCheckingUpdateState(false);
				library.changePendingUpdateState(false);
				return true;
			} else {
				console.log("Updates were found!");
				window.new_updates = response;
				library.changeIsCheckingUpdateState(false);
				library.changePendingUpdateState(true);
			}
		}).catch(err => {
			console.error('Failed checking updates:', err);
			library.changeIsCheckingUpdateState(false);
			library.changePendingUpdateState(false);
		});
	}
}

library.installGame = async function() {
	if(window.isUpdatingGame) return;
	library.changeUpdatingGameState(true);
	library.changePendingUpdateState(false);
	const settings = library.getSettings();
	const lastUpdateTimestamp = await library.getLatestUpdateTimestamp();
	const configPath = await resolve(await appCacheDir() + "/temp.7z");
	console.log('Starting downloading game...');
	invoke('download_file', { url: settings.updates_api_url + "download/0", tempPath: configPath}).then(stdout => {
		if(stdout === null) {
			console.log('Unpacking game...');
			invoke("unpack_archive", { archivePath: configPath, extractPath: settings.resource_path}).then(stdout => {
				if(stdout === null) {
					console.log('Game successfully downloaded!');
					library.changeUpdatingGameState(false);
					library.cleanTemporaryFiles();
					localStorage.update_time = lastUpdateTimestamp;
				} else {
					console.error('Failed extracting archive:', err);
					library.changeUpdatingGameState(false);
					library.cleanTemporaryFiles();
				}
			}).catch(err => {				
				console.error('Failed extracting archive:', err);
				library.changeUpdatingGameState(false);
				library.cleanTemporaryFiles();
			});
		} else {
			console.error('Failed downloading archive:', stdout);
			library.changeUpdatingGameState(false);
			library.cleanTemporaryFiles();
		}
	}).catch(err => {
		console.error('Failed downloading archive:', err);
		library.changeUpdatingGameState(false);
		library.cleanTemporaryFiles();
	});
}

library.cleanTemporaryFiles = async function() {
	if(window.isUpdatingGame) return;
	const settings = library.getSettings();
	const configPath = await resolve(await appCacheDir() + "/temp.7z");
	await remove(configPath).catch(err => {console.error(err);});
}

library.changeUpdatingGameState = async function(state) {
	window.isUpdatingGame = state;
	await window.updatePlayButtonState();
	document.dispatchEvent(playButtonStateChangeEvent);
}

library.changeIsCheckingUpdateState = async function(state) {
	window.isCheckingUpdate = state;
	await window.updatePlayButtonState();
	document.dispatchEvent(playButtonStateChangeEvent);
}

library.changeIsGameStartingState = async function(state) {
	window.isGameStarting = state;
	await window.updatePlayButtonState();
	document.dispatchEvent(playButtonStateChangeEvent);
}

library.changeIsGameRunningState = async function(state) {
	window.isGameRunning = state;
	await window.updatePlayButtonState();
	document.dispatchEvent(playButtonStateChangeEvent);
}

library.changePendingUpdateState = async function(state) {
	window.isPendingUpdate = state;
	await window.updatePlayButtonState();
	document.dispatchEvent(playButtonStateChangeEvent);
}

library.openOrInstallGame = async function() {
	if(isGameRunning) return;
	if(isPendingUpdate) return library.updateGame();
	await library.changeIsGameStartingState(true);
	await open("GreenCatsServer.exe").then(res => {
		library.changeIsGameStartingState(false);
		library.changeIsGameRunningState(true);
	}).catch(err => {
		library.changeIsGameStartingState(false);
		library.changeIsGameRunningState(false);
		console.log("Failed to run game:", err);
		library.updateGame();
	})
}

library.updateGame = async function() {
	if(window.isUpdatingGame) return;
	const settings = library.getSettings();
	if(settings.update_time == 0) return library.installGame();
	library.changePendingUpdateState(false);
	library.changeUpdatingGameState(true);
	var i = 0;
	for(i = 0; i < new_updates.length; i++) {
		await library.patchGame(new_updates[i]);
	}
	const lastUpdateTimestamp = new_updates[new_updates.length - 1];
	console.log('Game successfully updated!');
	library.changeUpdatingGameState(false);
	library.cleanTemporaryFiles();
	localStorage.update_time = lastUpdateTimestamp;
}

library.getLatestUpdateTimestamp = async function() {
	const settings = library.getSettings();
	return new Promise(r => {
		fetch(settings.updates_api_url + "lastUpdate").then(res => res.json()).then(response => {
			r(response.timestamp);
		}).catch(err => {
			console.error('Failed getting update time:', err);
			r(0);
		});
	});
}

library.patchGame = async function(patchTimestamp) {
	const settings = library.getSettings();
	const patchArchivePath = await resolve(await appCacheDir() + "/patch_" + patchTimestamp + ".7z");
	const patchFolderPath = await resolve(await appCacheDir() + "/patch_" + patchTimestamp);
	console.log('Downloading patch ' + patchTimestamp + '...');
	return new Promise(r => {
		invoke('download_file', { url: settings.updates_api_url + "download/" + patchTimestamp, tempPath: patchArchivePath}).then(stdout => {
			if(stdout === null) {
				console.log('Unpacking patch ' + patchTimestamp + '...');
				invoke("unpack_archive", { archivePath: patchArchivePath, extractPath: patchFolderPath}).then(async function(stdout) {
					if(stdout === null) {
						console.log('Patching ' + patchTimestamp + '...');
						const patchFiles = await library.recursiveReadDir(patchFolderPath, patchFolderPath);
						var i = 0;
						for(i = 0; i < patchFiles.length; i++) {
							var patchFunction = patchFiles[i].slice(-2);
							var patchFile = patchFiles[i].slice(0, patchFiles[i].length - 2);
							const patchPath = await join(settings.resource_path, patchFile);
							const fullPatchPath = await join(patchFolderPath, patchFile + ".p");
							switch(patchFunction) {
								case '.p':
									const check = await Command.create("bin/hpatch.exe", [patchPath, fullPatchPath, patchPath + "_new"], { encoding: "utf-8" }).execute();
									await remove(patchPath).catch(err => {console.error(err);});
									await rename(patchPath + "_new", patchPath).catch(err => {console.error(err);});
									console.log("Patched", patchFile);
									break;
								case '.m':
									await invoke('download_file', { url: settings.updates_api_url + "download/" + patchFile, tempPath: patchPath});
									console.log("Downloaded", patchFile);
									break;
								case '.d':
									await remove(patchPath).catch(err => {console.error(err);});
									console.log("Removed", patchFile);
									break;
							}
						}
						r(true);
					} else {
						console.error('Failed extracting archive:', err);
						library.changeUpdatingGameState(false);
						library.cleanTemporaryFiles();
						r(false);
					}
				}).catch(err => {				
					console.error('Failed extracting archive:', err);
					library.changeUpdatingGameState(false);
					library.cleanTemporaryFiles();
					r(false);
				});
			} else {
				console.error('Failed downloading archive:', stdout);
				library.changeUpdatingGameState(false);
				library.cleanTemporaryFiles();
				r(false);
			}
		}).catch(err => {
			console.error('Failed downloading archive:', err);
			library.changeUpdatingGameState(false);
			library.cleanTemporaryFiles();
			r(false);
		});
	});
}

library.recursiveReadDir = async function(parent, initialParent) {
	const dirEntries = await readDir(parent, { baseDir: BaseDirectory.Cache });
	const patchFiles = [];
	for(const entry of dirEntries) {
		const onlyFilePath = parent.substr(initialParent.length);
		patchFiles.push(onlyFilePath + entry.name);
		if(entry.isDirectory) {
			const dir = await join(parent, entry.name);
			library.recursiveReadDir(dir, initialParent);
		}
	}
	return patchFiles;
}

library.styles = style;

library.initializeEvents();

export default library;