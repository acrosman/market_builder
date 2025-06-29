// When the content of the page is ready, fire off the sample IPC message.
document.addEventListener('DOMContentLoaded', () => {
  // window.api.send('sample_message', {
  //   message_content: 'Stuff and Things',
  // });

  document.getElementById('new-game-btn').addEventListener('click', () => {
    window.api.send('open-new-game');
  });
});

// Sample Response Handler.
// window.api.receive('sample_response', (data) => {
//   alert(data.message);
// });
