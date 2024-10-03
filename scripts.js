let socket;
let deviceIp;
let peerConnection;
let sessionId;
let video;
let localStream;
let remoteStream;

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function generateString(length) {
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}


let peerConfiguration = {
    iceServers: [
        // {
        //   urls: "stun:52.168.33.165",
        // },
        {
            urls: "turn:coturn-0.devcloud6.avasure.dev",
            username: "1727103818:turn-user",
            credential: "MJE2N78rSgzIK/KmavZPTEzpIso=",
        }
    ],
}

// let peerConfiguration = {
//     iceServers: [
//         {
//           urls: "stun:fr-turn5-back.xirsys.com",
//         },
//         {
//           urls: "turn:fr-turn5-back.xirsys.com:80?transport=udp",
//           username: "G_J9DS17gBOk_XINL2WQv4Hs5UmsdewqXHfoYmgUVnAmD1kU_1Kfslto-S6iQuYmAAAAAGVWW_BWYWx5",
//           credential: "ef45661c-84ab-11ee-bd9c-0242ac120004",
//         }
//     ],
// }
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

document.getElementById("connect").addEventListener("submit", function (event) {
    event.preventDefault();
    deviceIp = document.getElementById("deviceIP").value;
    socket = new WebSocket(`wss://${deviceIp}:8444`);
    socket.onopen = e => {
        console.log("onopen: socket connected!");
        document.getElementById("socketState").textContent = "connected";
    };
    socket.onmessage = async e => {
        let msg = JSON.parse(e.data);
        // console.log(`onmessage: received ${msg.eventType}`)
        switch (msg.eventType) {
            case 'ANSWER':
                peerConnection.setRemoteDescription({
                    "sdp": msg.data.sdp,
                    "type": "answer"
                }).then(() => {
                    console.log("Answer set!")
                    console.log(msg.data.sdp)
                })
                break;
            case 'ICE_CANDIDATE':
                // console.log("candidate received: " + msg.data.candidate);
                while (peerConnection.currentRemoteDescription === null) {
                    console.log("waiting for remote description...");
                    await sleep(500);
                }
                peerConnection.addIceCandidate(new RTCIceCandidate({
                    "candidate": msg.data.candidate,
                    "sdpMLineIndex": msg.data.sdpMLineIndex,
                    "sdpMid": msg.data.sdpMLineIndex
                })).catch(err => {
                    console.log("error: " + err)
                });
                break;
        }

    };
    socket.onclose = e => {
        console.log("onclose: socket closed");
        document.getElementById("socketState").textContent = "disconnected";
    };
    socket.onerror = e => {
        console.log("onerror: " + JSON.stringify(e));
        document.getElementById("socketState").textContent = `Error - ${JSON.stringify(e)}`;
    }
});


document.getElementById("call").addEventListener("click", async function () {
    try {
        sessionId = generateString(10);
        document.getElementById("sessionId").textContent = sessionId
        video = document.getElementById('video');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localStream = stream;

        peerConnection = await new RTCPeerConnection(peerConfiguration);
        remoteStream = new MediaStream();
        video.srcObject = remoteStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        })

        peerConnection.getTransceivers().forEach((transceiver) => {
            if (transceiver.sender.track?.kind === 'audio') {
                transceiver.setCodecPreferences([
                    {
                        // Chrome
                        channels: 2,
                        clockRate: 48000,
                        mimeType: 'audio/opus',
                        // Chrome
                        sdpFmtpLine: 'minptime=10;useinbandfec=1',

                        //FireFox
                        // sdpFmtpLine: "maxplaybackrate=48000;stereo=1;useinbandfec=1"
                    },
                ]);
            }
            if (transceiver.sender.track?.kind === 'video') {
                transceiver.setCodecPreferences([
                    {
                        mimeType: 'video/H264',
                        clockRate: 90000,
                        // Chrome
                        sdpFmtpLine: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f',

                        // Firefox
                        // sdpFmtpLine: "profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1"
                    },
                ]);
            }
        });


        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log("signalingstatechange: " + peerConnection.signalingState);
        });

        peerConnection.addEventListener('icecandidate', async (event) => {
            var candidate = event.candidate;
            while (peerConnection.currentRemoteDescription === null) {
                console.log("waiting for remote description...");
                await sleep(500);
            }
            socket.send(JSON.stringify({
                "eventType": "ICE_CANDIDATE",
                "data": {
                    "sessionId": sessionId,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                    "candidate": candidate.candidate
                }
            }))
            // console.log(candidate)
        });

        peerConnection.addEventListener('track', e => {
            console.log("track: Got track from peer!")
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
            })
        });

        peerConnection.addEventListener('connectionstatechange', e => {
            document.getElementById("connectionState").textContent = peerConnection.connectionState;
            console.log("connectionstatechange: " + peerConnection.connectionState);
        });

        const offer = await peerConnection.createOffer();
        console.log("Offer Created!")
        console.log(offer.sdp);
        peerConnection.setLocalDescription(offer);

        socket.send(JSON.stringify({
            "eventType": "OFFER",
            "data": {
                "sessionId": sessionId,
                "type": "offer",
                "sdp": offer.sdp
            }
        }))
    } catch (err) {
        console.log("call error: " + err)
    }
});


document.getElementById("mute").addEventListener("click", async function () {
    let isEnabled = localStream.getAudioTracks()[0].enabled;
    localStream.getAudioTracks()[0].enabled = !isEnabled;

    document.getElementById("mute").textContent = !isEnabled ? "Mute" : "Unmute";
});

document.getElementById("enableVideo").addEventListener("click", async function () {
    fetch(`https://${deviceIp}:8443/api/audio/enable-video`, {
        method: "GET",
        mode: 'no-cors'
    }).catch((error) => console.log("error: " + error));

    console.log("video enabled");
});

document.getElementById("stop").addEventListener("click", async function () {
    fetch(`https://${deviceIp}:8443/api/audio/remove`, {
        method: "POST",
        headers: new Headers().append("Content-Type", "application/json"),
        body: sessionId,
        mode: 'no-cors'
    }).catch((error) => console.log("error: " + error));

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }

    video.srcObject = null;
    document.getElementById("sessionId").textContent = ""
    document.getElementById("connectionState").textContent = "disconnected";

    console.log("call stopped");
});
