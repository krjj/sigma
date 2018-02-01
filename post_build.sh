mkdir -p $HOME/.sigma && echo "Directory created [$HOME/.sigma]"
cp -R ./sigma $HOME/.sigma && echo "Executable copied to .sigma"
cd $HOME/.sigma && touch sigmalog.log 
(crontab -l | grep -v "@reboot cd \$HOME\/.sigma && .\/sigma") | crontab -
(crontab -l ; echo "@reboot cd \$HOME/.sigma && ./sigma") | crontab - && echo 'Program will launch at system startup automatically.'