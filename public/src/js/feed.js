var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');

var url = 'https://gram-ed160-default-rtdb.firebaseio.com/post.json';
var networkDataReceived = false;

function openCreatePostModal() {
    createPostArea.style.transform = 'translateY(0)';

    if (typeof deferredPrompt !== 'undefined' && deferredPrompt) {
        deferredPrompt.prompt();

        deferredPrompt.userChoice.then(function (choiceResult) {
            console.log(choiceResult.outcome);

            if (choiceResult.outcome === 'dismissed') {
                console.log('User cancelled installation');
            } else {
                console.log('User added to home screen');
            }
        });

        deferredPrompt = null;
    }
}

function closeCreatePostModal() {
    createPostArea.style.transform = 'translateY(100vh)';
}

shareImageButton.addEventListener('click', openCreatePostModal);

closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);

function clearCards() {
    while (sharedMomentsArea.hasChildNodes()) {
        sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
    }
}

function createCard(data) {
    var cardWrapper = document.createElement('div');
    cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';
    var cardTitle = document.createElement('div');
    cardTitle.className = 'mdl-card__title';
    cardTitle.style.backgroundImage = 'url(' + data.image + ')';
    cardTitle.style.backgroundSize = 'cover';
    cardTitle.style.height = '180px';
    cardWrapper.appendChild(cardTitle);
    var cardTitleTextElement = document.createElement('h2');
    cardTitleTextElement.style.color = 'white';
    cardTitleTextElement.className = 'mdl-card__title-text';
    cardTitleTextElement.textContent = data.title;
    cardTitle.appendChild(cardTitleTextElement);
    var cardSupportingText = document.createElement('div');
    cardSupportingText.className = 'mdl-card__supporting-text';
    cardSupportingText.textContent = data.location;
    cardSupportingText.style.textAlign = 'center';
    cardWrapper.appendChild(cardSupportingText);
    if (typeof componentHandler !== 'undefined') {
        componentHandler.upgradeElement(cardWrapper);
    }
    sharedMomentsArea.appendChild(cardWrapper);
}

function updateUI(data) {
    clearCards();
    for (var i = 0; i < data.length; i++) {
        createCard(data[i]);
    }
}

// 1) Red
function cargarPosts() {
    fetch(url)
        .then(function (res) {
            return res.json();
        })
        .then(function (data) {
            networkDataReceived = true;
            console.log('From web', data);
            var dataArray = [];
            for (var key in data) {
                dataArray.push(data[key]);
            }
            updateUI(dataArray);
        })
        .catch(function (err) {
            console.log('Error en la petición:', err);
        });
}

cargarPosts();

// Cuando el service worker termina de sincronizar, recargamos el feed
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data === 'posts-synced') {
            console.log('Posts sincronizados, actualizando feed...');
            cargarPosts();
        }
    });
}

// 2) IndexedDB (si la red no ha respondido o no hay conexión)
if ('indexedDB' in window) {
    readAllData('posts')
        .then(function (data) {
            if (!networkDataReceived) {
                console.log('From cache', data);
                updateUI(data);
            }
        });
}

// Envío directo (para navegadores sin Background Sync)
function sendData() {
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            id: new Date().toISOString(),
            title: titleInput.value,
            location: locationInput.value,
            image: '/src/images/sf-boat.jpg'
        })
    })
        .then(function (res) {
            console.log('Sent data', res);
        })
        .catch(function (err) {
            console.log('Error enviando:', err);
        });
}

form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (titleInput.value.trim() === '' || locationInput.value.trim() === '') {
        alert('Please enter valid data!');
        return;
    }

    closeCreatePostModal();

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(function (sw) {
                var post = {
                    id: new Date().toISOString(),
                    title: titleInput.value,
                    location: locationInput.value
                };
                writeData('sync-posts', post)
                    .then(function () {
                        return sw.sync.register('sync-new-posts');
                    })
                    .then(function () {
                        var snackbarContainer = document.querySelector('#confirmation-toast');
                        var data = { message: 'Your Post was saved for syncing!' };
                        snackbarContainer.MaterialSnackbar.showSnackbar(data);
                    })
                    .catch(function (err) {
                        console.log(err);
                    });
            });
    } else {
        sendData();
    }
});

// Si vuelve el internet o se abre la página con conexión,
// pedimos otra vez el sync para enviar lo que quedó pendiente
function registrarSyncPendiente() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(function (sw) {
                return sw.sync.register('sync-new-posts');
            })
            .catch(function (err) {
                console.log('No se pudo registrar el sync', err);
            });
    }
}

window.addEventListener('online', function () {
    console.log('Conexión recuperada, sincronizando...');
    registrarSyncPendiente();
});

if (navigator.onLine) {
    registrarSyncPendiente();
}